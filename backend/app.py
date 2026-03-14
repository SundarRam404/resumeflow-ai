from gevent import monkey
monkey.patch_all()

import os
import json
import re
import uuid
import fitz
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from groq import Groq

# -------------------------------
# APP SETUP
# -------------------------------

app = Flask(__name__)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS(app, resources={r"/*": {"origins": frontend_url}})

groq_key = os.getenv("GROQ_API_KEY")
if not groq_key:
    raise ValueError("GROQ_API_KEY environment variable not set!")

client = Groq(api_key=groq_key)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# -------------------------------
# FAST RESUME HELPERS
# -------------------------------

def extract_pdf_text(pdf_file):
    doc = fitz.open(pdf_file)
    text = ""

    for page in doc:
        text += page.get_text()

    doc.close()
    return text


def split_resume_chunks(text, chunk_words=800):
    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_words):
        chunk = " ".join(words[i:i + chunk_words])
        chunks.append(chunk)

    return chunks


# -------------------------------
# RESUME PARSER (FAST)
# -------------------------------

def parse_resume_content(pdf_path):

    resume_text = extract_pdf_text(pdf_path)
    chunks = split_resume_chunks(resume_text)

    prompt = """
Extract structured resume information.

Return JSON with fields:
name
email
phone
education
skills
experience
projects
"""

    combined_output = ""

    for chunk in chunks[:3]:   # limit chunks for speed
        full_prompt = f"{prompt}\n\nResume Section:\n{chunk}"

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": full_prompt}]
        )

        combined_output += response.choices[0].message.content + "\n"

    try:
        json_match = re.search(r'\{.*\}', combined_output, re.DOTALL)
        parsed_json = json.loads(json_match.group())

        display = f"```json\n{json.dumps(parsed_json,indent=2)}\n```"

        return {
            "display_output": display,
            "raw_parsed_text": json.dumps(parsed_json),
            "extracted_name": parsed_json.get("name","Unknown")
        }

    except:
        return {
            "display_output": combined_output,
            "raw_parsed_text": combined_output,
            "extracted_name": "Unknown"
        }


# -------------------------------
# RESUME CHECK
# -------------------------------

def resume_check_content(text):

    prompt = f"""
Review this resume and give improvement suggestions.

{text}
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role":"user","content":prompt}]
    )

    return response.choices[0].message.content


# -------------------------------
# JD MATCH
# -------------------------------

def jd_match_content(resume,jd):

    prompt=f"""
Compare resume and job description.

Resume:
{resume}

Job Description:
{jd}

Return skill match table.
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role":"user","content":prompt}]
    )

    return response.choices[0].message.content


# -------------------------------
# INTERVIEW QUESTIONS
# -------------------------------

def generate_questions_content(resume,jd):

    prompt=f"""
Generate interview questions.

Resume:
{resume}

Job:
{jd}
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role":"user","content":prompt}]
    )

    return response.choices[0].message.content


# -------------------------------
# FIT SCORE
# -------------------------------

def fit_score_content(resume,jd):

    prompt=f"""
Give job fit score out of 10.

Resume:
{resume}

Job Description:
{jd}
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role":"user","content":prompt}]
    )

    return response.choices[0].message.content


# -------------------------------
# API ROUTES
# -------------------------------

@app.route("/parse_resume",methods=["POST"])
def api_parse_resume():

    if "resume" not in request.files:
        return jsonify({"error":"No resume uploaded"}),400

    file=request.files["resume"]

    filename=secure_filename(file.filename)
    temp_path=os.path.join(UPLOAD_FOLDER,f"{uuid.uuid4()}_{filename}")

    file.save(temp_path)

    data=parse_resume_content(temp_path)

    return jsonify(data)


@app.route("/resume_check",methods=["POST"])
def api_resume_check():

    data=request.get_json()

    return jsonify({
        "output":resume_check_content(data.get("resume_text"))
    })


@app.route("/jd_match",methods=["POST"])
def api_jd_match():

    data=request.get_json()

    return jsonify({
        "output":jd_match_content(
            data.get("resume_text"),
            data.get("jd_text")
        )
    })


@app.route("/generate_questions",methods=["POST"])
def api_questions():

    data=request.get_json()

    return jsonify({
        "output":generate_questions_content(
            data.get("resume_text"),
            data.get("jd_text")
        )
    })


@app.route("/fit_score",methods=["POST"])
def api_fit_score():

    data=request.get_json()

    return jsonify({
        "output":fit_score_content(
            data.get("resume_text"),
            data.get("jd_text")
        )
    })


# -------------------------------
# SERVER START
# -------------------------------

if __name__=="__main__":

    port=int(os.environ.get("PORT",10000))
    app.run(host="0.0.0.0",port=port)
