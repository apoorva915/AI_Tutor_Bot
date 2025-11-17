## AI Tutor Bot

A lightweight RAG chatbot that ingests a chapter PDF, answers follow‑up questions with grounded context, and surfaces a relevant diagram with every response.

### 1. Prerequisites
- Python 3.9+
- Node/npm (or any static file server) for the frontend
- Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # PowerShell
pip install -r requirements.txt
```

Create a `.env` file (project root) with:
```
GEMINI_API_KEY=your_real_key_here
```
The FastAPI app uses `python-dotenv`, so the key is loaded automatically on startup.

Run the API (two common options):
```bash
# hot reload via uvicorn
uvicorn app.main:app --reload

# or, if you prefer the helper script
python run.py
```

### 3. Frontend Setup
Open a second terminal window and serve the static files with Python’s built‑in server:
```bash
cd frontend
python -m http.server 5500
```
Visit http://localhost:5500 in your browser (the frontend already points to http://localhost:8000 for the API by default).

### 4. RAG Pipeline Explained
| Stage | Code Path | What Happens |
|-------|-----------|--------------|
| **A. Upload** | `backend/app/main.py` → `upload_pdf` | PDF saved to `uploads/`, pages parsed with PyMuPDF (`extract_text_from_pdf`). |
| **B. Chunking** | `app/utils.py` → `create_text_chunks` | Each page is split into ~500-char overlapping chunks (with `page` metadata). |
| **C. Embeddings** | `app/rag.py` → `create_embeddings(..., regenerate=True)` | SentenceTransformer (`all-MiniLM-L6-v2`) encodes every chunk once; the vector is stored in each chunk dict. |
| **D. Persistence** | `app/utils.py` → `save_embeddings` | Chunks + embeddings and image metadata are written to `data/embeddings/<topic>_{chunks,images}.json`. |
| **E. Retrieval Prep** | `/chat` reloads chunks, rebuilds a FAISS L2 index from persisted vectors (no re-encoding). |
| **F. Question Answering** | `rag_pipeline.retrieve_chunks` + `generate_answer` | User query is embedded, top‑k chunks retrieved, context + question are sent to Gemini with retry/backoff and safety handling. |
| **G. Sources** | `main.py` | Answer references the unique page numbers from the retrieved chunks so the frontend can display “Sources: Page x”. |

This setup satisfies the assignment requirement to store embeddings locally (JSON + FAISS rebuild) while keeping chats fast after the initial upload.

### 5. Image Retrieval Logic (Detailed)
1. **Metadata** – `images_metadata.json` lists each diagram (`id`, filename, title, keywords, description).
2. **Embedding creation** – On upload (or chat reload), `image_retriever.load_image_metadata` encodes the concatenated `description + keywords + title` text via SentenceTransformer.
3. **Similarity scoring** – Every answer/question pair is embedded and compared against each diagram using cosine similarity.
4. **Keyword boost** – The retriever also scans the question/answer text for keyword and title matches (with stemming and fuzzy matching). Scores are normalized.
5. **Final ranking** – The final score = `0.6 * embedding_similarity + 0.4 * keyword_score`. The diagram with the highest score is returned to the API.
6. **Delivery** – The frontend calls `/images/file/<filename>` to display the chosen image with a caption, ensuring each textual response gets a relevant visual.

### 6. Prompt Used (Full Text)
```
You are an AI tutor helping students understand educational content. 
Your role is to provide clear, accurate, and helpful explanations based on the provided textbook context.

Based on the following context from the textbook, please answer the student's question:

CONTEXT FROM TEXTBOOK:
{context}

STUDENT'S QUESTION: {question}

Please provide a helpful answer that:
1. Directly addresses the question using information from the context
2. Is educational and easy to understand
3. Uses examples when helpful
4. Is structured clearly
5. Does not mention that you are using retrieved context
6. Stays focused on the educational content

Answer:
```

This is the exact prompt that `rag_pipeline.generate_answer` uses for every Gemini call.

### 7. Demo Flow
1. Upload `Sound.pdf` (or any chapter) via the UI.
2. Wait for “Ready for questions”; the sidebar shows the topic id + chunk count.
3. Ask questions; each response should include grounded text, cited pages, and an illustrative image.