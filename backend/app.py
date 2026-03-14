import os
import json
import re
import uuid
import fitz
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from groq import Groq

# -------------------------------
# APP SETUP
# -------------------------------

app = Flask(__name__)

# Updated CORS to be more flexible for development
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS(app, resources={r"/*": {"origins": "*"}}) 

groq_key = os.getenv("GROQ_API_KEY")
if not groq_key:
    # Fallback for local testing if env is missing, but better to raise in production
    print("Warning: GROQ_API_KEY environment variable not set!")

client = Groq(api_key=groq_key)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Mock Database for resumes (In-memory)
# Note: On Render, this resets whenever the server sleeps or restarts.
saved_resumes = []

# -------------------------------
# HELPERS
# -------------------------------

def extract_pdf_text(pdf_path):
    text = ""
    try:
        doc = fitz.open(pdf_path)
        for page in doc:
            text += page.get_text()
        doc.close()
    except Exception as e:
        print(f"Error extracting PDF: {e}")
    return text

def parse_resume_content(pdf_path):
    resume_text = extract_pdf_text(pdf_path)
    
    # Prompting for a strict JSON format
    prompt = """
    Extract resume information.
    Return STRICT JSON only.
    Schema:
    {"name": "",
    "email": "",
    "phone": "",
    "education": [],
    "skills": [],
    "experience": [],
    "projects": []
    }
    Do not add explanations.
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": f"{prompt}\n\nResume Text:\n{resume_text[:2000]}"}]
        )
        
        raw_content = response.choices[0].message.content
        print("GROQ OUTPUT:", raw_content)
        try:
            parsed_json = json.loads(raw_content)
        except:
            json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
            if json_match:
                parsed_json = json.loads(json_match.group())
            else:
                parsed_json = {}

        return {
            "display_output": json.dumps(parsed_json, indent=2),
            "raw_parsed_text": resume_text, # Keeping full text for analysis later
            "extracted_name": parsed_json.get("name", "Unknown"),
            "parsed_data": parsed_json
        }
    except Exception as e:
        return {
            "display_output": "Error parsing resume",
            "raw_parsed_text": resume_text,
            "extracted_name": "Unknown",
            "parsed_data": {}
        }

# -------------------------------
# API ROUTES
# -------------------------------

@app.route("/parse_resume", methods=["POST"])
def api_parse_resume():
    if "resume" not in request.files:
        return jsonify({"error": "No resume uploaded"}), 400

    file = request.files["resume"]
    filename = secure_filename(file.filename)
    unique_id = str(uuid.uuid4())
    temp_path = os.path.join(UPLOAD_FOLDER, f"{unique_id}_{filename}")
    file.save(temp_path)

    data = parse_resume_content(temp_path)
    if os.path.exists(temp_path):
        os.remove(temp_path)
    
    # Save to our "database" so the GET request finds it
    resume_entry = {
        "id": unique_id,
        "filename": filename,
        "name": data["extracted_name"],
        "timestamp": datetime.now().isoformat(),
        "role": "Software Engineer", # Default or logic to detect
        "data": data["parsed_data"],
        "full_text": data["raw_parsed_text"]
    }
    saved_resumes.append(resume_entry)

    return jsonify(data)

@app.route("/get_saved_resumes", methods=["GET"])
def get_saved_resumes():
    # This addresses your 404 error
    role_filter = request.args.get("role", "All Roles")
    sort_key = request.args.get("sort_key", "timestamp")
    sort_order = request.args.get("sort_order", "desc")

    filtered_data = saved_resumes
    if role_filter != "All Roles":
        filtered_data = [r for r in saved_resumes if r.get("role") == role_filter]

    # Simple sort logic
    reverse = True if sort_order == "desc" else False
    filtered_data.sort(key=lambda x: x.get(sort_key, ""), reverse=reverse)

    return jsonify(filtered_data)

@app.route("/resume_check", methods=["POST"])
def api_resume_check():
    data = request.get_json()
    prompt = f"Review this resume and give improvement suggestions:\n{data.get('resume_text')}"
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}]
    )
    return jsonify({"output": response.choices[0].message.content})

@app.route("/jd_match", methods=["POST"])
def api_jd_match():
    data = request.get_json()
    prompt = f"Compare Resume: {data.get('resume_text')} with JD: {data.get('jd_text')}. Return a skill match table."
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}]
    )
    return jsonify({"output": response.choices[0].message.content})

@app.route('/jd_options', methods=['GET'])
def jd_options():
    return jsonify(["Software Engineer", "Frontend Developer", "Data Scientist", "DevOps Engineer"])

@app.route('/jd_default', methods=['GET'])
def jd_default():
    return jsonify({
        "Software Engineer": "Seeking a Software Engineer skilled in Python and React."
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
