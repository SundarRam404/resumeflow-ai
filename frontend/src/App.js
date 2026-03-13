import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

import LoaderGif from './load.gif'; // Make sure this path is correct

// Fixed: Dynamic URL for local and production
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:10000";

function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jdOptions, setJdOptions] = useState([]); 
  const [selectedJDRole, setSelectedJDRole] = useState('Software Engineer'); 
  const [jdText, setJdText] = useState(''); 
  
  const [resumeTextCache, setResumeTextCache] = useState(''); 
  
  const [parsedResumeOutput, setParsedResumeOutput] = useState(''); 
  const [resumeTableOutput, setResumeTableOutput] = useState('');
  const [resumeCheckOutput, setResumeCheckOutput] = useState('');
  const [jdMatchOutput, setJdMatchOutput] = useState('');
  const [interviewQaOutput, setInterviewQaOutput] = useState('');
  const [fitScoreOutput, setFitScoreOutput] = useState('');
  const [activeTab, setActiveTab] = useState('parse'); 
  const [loading, setLoading] = useState(false); 
  const [error, setError] = useState(null); 
  const [showFullFitScoreReview, setShowFullFitScoreReview] = useState(false); 

  const [savedResumes, setSavedResumes] = useState([]); 
  const [showInterviewQaId, setShowInterviewQaId] = useState(null); 
  const [savedJdFilter, setSavedJdFilter] = useState('All Roles'); 
  const [extractedResumeName, setExtractedResumeName] = useState(''); 
  const [tempSavedFilename, setTempSavedFilename] = useState(''); 

  const [sortKey, setSortKey] = useState('timestamp'); 
  const [sortOrder, setSortOrder] = useState('desc'); 

  const getDisplayScore = (markdown) => {
    if (!markdown) return null;

    let scoreMatch = markdown.match(/Score:\s*(\d+(\.\d+)?)\s*(\/\s*\d+)?(\s*%?)?/i);
    if (scoreMatch) {
      const value = scoreMatch[1]; 
      const divisor = scoreMatch[3] ? scoreMatch[3].replace(/\s*\/\s*/, '') : ''; 
      const isPercentage = scoreMatch[4] && scoreMatch[4].includes('%');

      if (isPercentage) {
        return `${parseInt(value)}/100`;
      } else if (divisor) {
        return `${value}/${divisor}`;
      } else {
        return `${parseInt(value)}/100`;
      }
    }

    let match = markdown.match(/^(\d+)%/); 
    if (match) {
      return `${match[1]}/100`;
    }

    match = markdown.match(/^(\d+)\s*\/\s*(\d+)/); 
    if (match) {
      return `${match[1]}/${match[2]}`;
    }

    match = markdown.match(/^(\d+)(?:\.\d+)?$/); 
    if (match) {
        return `${parseInt(match[1])}/100`;
    }

    const firstLine = markdown.split('\n')[0].trim();
    if (firstLine.length > 50) return "Score Available"; 
    return firstLine || "Score Available";
  };

  const fetchSavedResumes = useCallback(async (roleFilter, currentSortKey, currentSortOrder) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/get_saved_resumes?role=${encodeURIComponent(roleFilter)}&sort_key=${encodeURIComponent(currentSortKey)}&sort_order=${encodeURIComponent(currentSortOrder)}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setSavedResumes(data);
    } catch (err) {
      console.error("Failed to fetch saved resumes:", err);
      setError("Failed to fetch saved resumes: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []); 

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const optionsRes = await fetch(`${API_BASE_URL}/jd_options`);
        if (!optionsRes.ok) throw new Error(`HTTP error! status: ${optionsRes.status}`);
        const optionsData = await optionsRes.json();
        setJdOptions(['All Roles', ...optionsData, 'Custom Input']);

        const defaultJdRes = await fetch(`${API_BASE_URL}/jd_default`);
        if (!defaultJdRes.ok) throw new Error(`HTTP error! status: ${defaultJdRes.status}`);
        const defaultJdData = await defaultJdRes.json();
        setJdText(defaultJdData);

        fetchSavedResumes('All Roles', sortKey, sortOrder); 

      } catch (err) {
        console.error("Failed to load initial data:", err);
        setError("Failed to load initial data. Please ensure the backend server is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [fetchSavedResumes, sortKey, sortOrder]); 

  const handleJDRoleChange = async (e) => {
    const role = e.target.value;
    setSelectedJDRole(role);
    if (role !== 'Custom Input' && role !== 'All Roles') {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/jd_text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role }),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setJdText(data);
      } catch (err) {
        console.error("Failed to fetch JD text:", err);
        setError("Failed to fetch JD text: " + err.message);
      } finally {
        setLoading(false);
      }
    } else if (role === 'Custom Input') {
      setJdText(''); 
    }
  };

  const handleResumeFileChange = (e) => {
    setResumeFile(e.target.files[0]);
    setParsedResumeOutput('');
    setResumeTextCache('');
    setResumeTableOutput('');
    setResumeCheckOutput('');
    setJdMatchOutput('');
    setInterviewQaOutput('');
    setFitScoreOutput('');
    setExtractedResumeName(''); 
    setTempSavedFilename(''); 
    setError(null);
  };

  const handleParseResume = async () => {
    if (!resumeFile) {
      setError("Please upload a PDF resume.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile); 

      const response = await fetch(`${API_BASE_URL}/parse_resume`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setParsedResumeOutput(data.display_output);
        setResumeTextCache(data.raw_parsed_text);
        setExtractedResumeName(data.extracted_name); 
        setTempSavedFilename(data.temp_saved_filename); 
        setActiveTab('parse'); 
      } else {
        setError(data.error || "Failed to parse resume.");
        setParsedResumeOutput(`\`\`\`plain\nError: ${data.error || "Failed to parse resume."}\n\`\`\``);
      }
    } catch (err) {
      console.error("Error parsing resume:", err);
      setError("Error parsing resume: " + err.message);
      setParsedResumeOutput(`\`\`\`plain\nError: ${err.message}\n\`\`\``);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateResumeTable = async () => {
    if (!resumeTextCache) {
      setError("Please parse a resume first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/generate_resume_table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text_cache: resumeTextCache }),
      });
      const data = await response.json();
      if (response.ok) {
        setResumeTableOutput(data.output);
        setActiveTab('table'); 
      } else {
        setError(data.error || "Failed to generate resume table.");
      }
    } catch (err) {
      console.error("Error generating resume table:", err);
      setError("Error generating resume table: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeCheck = async () => {
    if (!resumeTextCache) {
      setError("Please parse a resume first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/resume_check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: resumeTextCache }),
      });
      const data = await response.json();
      if (response.ok) {
        setResumeCheckOutput(data.output);
        setActiveTab('check'); 
      } else {
        setError(data.error || "Failed to perform resume check.");
      }
    } catch (err) {
      console.error("Error performing resume check:", err);
      setError("Error performing resume check: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJDMatch = async () => {
    if (!resumeTextCache || !jdText) {
      setError("Please parse a resume and provide a job description.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/jd_match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: resumeTextCache, jd_text: jdText }),
      });
      const data = await response.json();
      if (response.ok) {
        setJdMatchOutput(data.output);
        setActiveTab('jd-match'); 
      } else {
        setError(data.error || "Failed to generate JD match.");
      }
    } catch (err) {
      console.error("Error generating JD match:", err);
      setError("Error generating JD match: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!resumeTextCache || !jdText) {
      setError("Please parse a resume and provide a job description.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/generate_questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: resumeTextCache, jd_text: jdText }),
      });
      const data = await response.json();
      if (response.ok) {
        setInterviewQaOutput(data.output);
        setActiveTab('interview-qa'); 
      } else {
        setError(data.error || "Failed to generate questions.");
      }
    } catch (err) {
      console.error("Error generating questions:", err);
      setError("Error generating questions: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFitScore = async () => {
    if (!resumeTextCache || !jdText) {
      setError("Please parse a resume and provide a job description.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/fit_score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: resumeTextCache, jd_text: jdText }),
      });
      const data = await response.json();
      if (response.ok) {
        setFitScoreOutput(data.output);
      } else {
        setError(data.error || "Failed to calculate fit score.");
      }
    } catch (err) {
      console.error("Error calculating fit score:", err);
      setError("Error calculating fit score: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDocument = async () => {
    if (!resumeTextCache || !jdText || !fitScoreOutput || !interviewQaOutput || !extractedResumeName || !tempSavedFilename) {
      setError("Please ensure a resume is parsed, fit score and interview Q&A are generated, and a name is extracted before confirming.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/confirm_document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text_cache: resumeTextCache,
          jd_text: jdText,
          fit_score_output: fitScoreOutput,
          interview_qa_output: interviewQaOutput,
          selected_jd_role: selectedJDRole,
          original_file_name: resumeFile.name, 
          temp_saved_filename: tempSavedFilename, 
          parsed_resume_name: extractedResumeName, 
          timestamp: new Date().toISOString() 
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert("Document saved successfully!"); 
        await fetchSavedResumes(savedJdFilter, sortKey, sortOrder); 
        handleClearOutputs(); 
        setActiveTab('all-resumes'); 
      } else {
        setError(data.error || "Failed to confirm and save document.");
      }
    } catch (err) {
      console.error("Error confirming document:", err);
      setError("Error confirming document: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadResume = (filename) => {
    window.open(`${API_BASE_URL}/download_resume/${filename}`, '_blank');
  };

  const toggleInterviewQa = async (id, filename) => {
    if (showInterviewQaId === id) {
      setShowInterviewQaId(null); 
    } else {
      setLoading(true); 
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/get_interview_qa/${filename}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setSavedResumes(prevResumes => prevResumes.map(resume =>
          resume.id === id ? { ...resume, qa_content_display: data.qa_content } : resume
        ));
        setShowInterviewQaId(id);
      } catch (err) {
        console.error("Error fetching interview QA:", err);
        setError("Error fetching interview QA: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClearOutputs = () => {
    setResumeFile(null);
    setParsedResumeOutput('');
    setResumeTextCache('');
    setResumeTableOutput('');
    setResumeCheckOutput('');
    setJdMatchOutput('');
    setInterviewQaOutput('');
    setFitScoreOutput('');
    setExtractedResumeName('');
    setTempSavedFilename('');
    setError(null);
    setShowFullFitScoreReview(false);
    const fileInput = document.getElementById('resume-upload');
    if (fileInput) fileInput.value = '';
    setActiveTab('parse'); 
  };

  const handleClearEverything = async () => {
    if (window.confirm("WARNING: This will delete ALL saved resumes and analyses permanently.\nNote: This will delete all saved resumes. Are you sure?")) { 
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/clear_all_data`, {
          method: 'POST',
        });
        const data = await response.json();
        if (response.ok) {
          alert("All data cleared successfully!"); 
          handleClearOutputs(); 
          await fetchSavedResumes('All Roles', sortKey, sortOrder); 
        } else {
          setError(data.error || "Failed to clear all data.");
        }
      } catch (err) {
        console.error("Error clearing all data:", err);
        setError("Error clearing all data: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSortChange = (key) => {
    let newOrder = 'asc';
    if (sortKey === key && sortOrder === 'asc') {
      newOrder = 'desc';
    }
    setSortKey(key);
    setSortOrder(newOrder);
  };

  return (
    <div className="App">
      <div className="hero-section">
        <div className="hero-background"></div>
        <div className="hero-content">
          <h1>ResumeFlow AI</h1>
          <p>Instantly analyze your resume, optimize for job descriptions, and prepare for interviews.</p>
        </div>
      </div>

      <main className="main-content">
        <section className="input-section">
          <h2 className="section-title">Resume & JD Analyzer</h2>
          {error && <div className="error-message">{error}</div>}

          <div className="input-grid">
            <div className="input-group">
              <label htmlFor="resume-upload">Upload Your Resume (PDF)</label>
              <input type="file" id="resume-upload" accept=".pdf" onChange={handleResumeFileChange} />
              <button onClick={handleParseResume} disabled={loading || !resumeFile}>
                {loading && activeTab === 'parse' ? 'Parsing...' : 'Parse Resume'}
              </button>
            </div>

            <div className="input-group job-description-group">
              <label htmlFor="jd-select">Select Job Description Role</label>
              <select id="jd-select" value={selectedJDRole} onChange={handleJDRoleChange} disabled={loading}>
                {jdOptions.filter(opt => opt !== 'All Roles').map((option) => ( 
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>

              <label htmlFor="jd-text-input">Or Paste Custom Job Description</label> 
              <textarea
                id="jd-text-input" 
                placeholder="Paste your job description here..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                disabled={selectedJDRole !== 'Custom Input' || loading}
              ></textarea>
            </div>

            <div className="input-group score-input-group">
                <label>Calculate Resume Fit Score</label> 
                <button onClick={handleFitScore} disabled={loading || !resumeTextCache || !jdText}>
                    {loading && activeTab === 'fit-score' ? 'Calculating...' : 'Get Fit Score'}
                </button>
                {fitScoreOutput && (
                    <>
                        <div className="score-output-box">
                            <span className="medal-icon">🏅</span>
                            <div className="score-value">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {getDisplayScore(fitScoreOutput)}
                                </ReactMarkdown>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowFullFitScoreReview(!showFullFitScoreReview)}
                            className="toggle-review-button"
                        >
                            {showFullFitScoreReview ? 'Hide Full Review' : 'Show Full Review'}
                        </button>
                        {showFullFitScoreReview && (
                            <div className="full-review-dropdown">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {fitScoreOutput}
                                </ReactMarkdown>
                            </div>
                        )}
                    </>
                )}
                {(fitScoreOutput && interviewQaOutput && extractedResumeName && tempSavedFilename) && (
                    <button
                        className="confirm-document-button"
                        onClick={handleConfirmDocument}
                        disabled={loading}
                    >
                        Confirm Document
                    </button>
                )}
            </div>
          </div>

          <div className="action-buttons-group">
            <button onClick={handleClearOutputs} disabled={loading}>
                Clear All Outputs
            </button>
            <button onClick={handleClearEverything} disabled={loading} className="clear-everything-button">
                Clear EVERYTHING ⚠️ (Note: This will delete all saved resumes)
            </button>
          </div>

        </section>

        {loading && (
            <section className="loading-overlay-section">
                <div className="loading-message">
                    <img src={LoaderGif} alt="Loading..." className="loader-image" />
                    <p>Processing your request...</p>
                </div>
            </section>
        )}

        <section className="output-section">
          <div className="tabs">
            <button
              className={activeTab === 'parse' ? 'active' : ''}
              onClick={() => setActiveTab('parse')}
            >
              Parsed Resume
            </button>
            <button
              className={activeTab === 'table' ? 'active' : ''}
              onClick={() => setActiveTab('table')} 
              disabled={!resumeTextCache}
            >
              Resume Table
            </button>
            <button
              className={activeTab === 'check' ? 'active' : ''}
              onClick={() => setActiveTab('check')} 
              disabled={!resumeTextCache}
            >
              Resume Check
            </button>
            <button
              className={activeTab === 'jd-match' ? 'active' : ''}
              onClick={() => setActiveTab('jd-match')} 
              disabled={!resumeTextCache || !jdText}
            >
              JD Match
            </button>
            <button
              className={activeTab === 'interview-qa' ? 'active' : ''}
              onClick={() => setActiveTab('interview-qa')} 
              disabled={!resumeTextCache || !jdText}
            >
              Interview Q&A
            </button>
            <button
              className={activeTab === 'all-resumes' ? 'active' : ''}
              onClick={() => { setActiveTab('all-resumes'); fetchSavedResumes(savedJdFilter, sortKey, sortOrder); }}
            >
              All Resumes
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'parse' && (
              <div className="tab-pane">
                <h3>Parsed Resume Text</h3>
                <div className="output-area code-block">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {parsedResumeOutput || 'Upload and parse a resume to see the extracted text here.'}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {activeTab === 'table' && (
              <div className="tab-pane">
                <h3>Generated Resume Table</h3>
                <button onClick={handleGenerateResumeTable} disabled={loading || !resumeTextCache}>
                    Generate Table
                </button>
                <div className="output-area markdown-output">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {resumeTableOutput || 'Click "Generate Table" to get structured resume data.'}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {activeTab === 'check' && (
              <div className="tab-pane">
                <h3>Resume Check & Feedback</h3>
                <button onClick={handleResumeCheck} disabled={loading || !resumeTextCache}>
                    Perform Check
                </button>
                <div className="output-area markdown-output">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {resumeCheckOutput || 'Click "Perform Check" to get feedback on your resume.'}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {activeTab === 'jd-match' && (
              <div className="tab-pane">
                <h3>Job Description Match Analysis</h3>
                <button onClick={handleJDMatch} disabled={loading || !resumeTextCache || !jdText}>
                    Analyze JD Match
                </button>
                <div className="output-area markdown-output">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {jdMatchOutput || 'Click "Analyze JD Match" to see how well your resume matches the job description.'}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {activeTab === 'interview-qa' && (
              <div className="tab-pane">
                <h3>Interview Questions & Answers</h3>
                <button onClick={handleGenerateQuestions} disabled={loading || !resumeTextCache || !jdText}>
                    Generate Q&A
                </button>
                <div className="output-area markdown-output">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {interviewQaOutput || 'Click "Generate Q&A" to generate personalized interview questions.'}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {activeTab === 'all-resumes' && (
              <div className="tab-pane all-resumes-section">
                <h3>All Saved Resumes</h3>
                <div className="jd-filter-container">
                    <label htmlFor="saved-jd-filter">Filter by Job Role:</label>
                    <select id="saved-jd-filter" value={savedJdFilter} onChange={(e) => {
                        setSavedJdFilter(e.target.value);
                        fetchSavedResumes(e.target.value, sortKey, sortOrder);
                    }} disabled={loading}>
                        {jdOptions.map((option) => ( 
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </div>

                <div className="sort-controls">
                    <span>Sort by:</span>
                    <button 
                        onClick={() => handleSortChange('person_name')} 
                        className={sortKey === 'person_name' ? 'active' : ''}
                    >
                        Name {sortKey === 'person_name' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </button>
                    <button 
                        onClick={() => handleSortChange('fit_score')} 
                        className={sortKey === 'fit_score' ? 'active' : ''}
                    >
                        Score {sortKey === 'fit_score' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </button>
                    <button 
                        onClick={() => handleSortChange('timestamp')} 
                        className={sortKey === 'timestamp' ? 'active' : ''}
                    >
                        Date {sortKey === 'timestamp' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </button>
                </div>

                {loading ? (
                    <div className="loading-message">
                        <img src={LoaderGif} alt="Loading..." className="loader-image" />
                        <p>Loading saved resumes...</p>
                    </div>
                ) : savedResumes.length === 0 ? (
                    <p className="no-resumes-message">No resumes saved yet for this role. Confirm a document to see it here!</p>
                ) : (
                    <div className="saved-resumes-list">
                        {savedResumes.map((resume) => (
                            <div key={resume.id} className="saved-resume-item">
                                <div className="resume-info">
                                    <span className="person-name">{resume.person_name}</span>
                                    <span className="jd-role-tag">{resume.jd_role}</span>
                                    <span className="fit-score-display">
                                        Score: <ReactMarkdown remarkPlugins={[remarkGfm]}>{getDisplayScore(resume.fit_score)}</ReactMarkdown>
                                    </span>
                                </div>
                                <div className="resume-actions">
                                    {resume.resume_filename && (
                                        <button
                                            className="download-button"
                                            onClick={() => handleDownloadResume(resume.resume_filename)}
                                        >
                                            Download Resume
                                        </button>
                                    )}
                                    {resume.qa_filename && (
                                        <button
                                            className="toggle-qa-button"
                                            onClick={() => toggleInterviewQa(resume.id, resume.qa_filename)}
                                        >
                                            {showInterviewQaId === resume.id ? 'Hide Q&A' : 'Show Q&A'}
                                        </button>
                                    )}
                                </div>
                                {showInterviewQaId === resume.id && resume.qa_content_display && (
                                    <div className="interview-qa-dropdown output-area markdown-output">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {resume.qa_content_display}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
