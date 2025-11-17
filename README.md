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

Run the API:
```bash
uvicorn app.main:app --reload
```

### 3. Frontend Setup
Serve `frontend/` however you like, e.g.
```bash
cd frontend
npx serve .
```
Open the reported URL (default http://localhost:5500) and point it at the backend running on http://localhost:8000.

### 4. RAG Pipeline Overview
1. **Upload** – PDF text is extracted with PyMuPDF and chunked with overlap.
2. **Embeddings** – SentenceTransformer (`all-MiniLM-L6-v2`) creates vectors for each chunk once. The embeddings are stored inside `data/embeddings/<topic>_chunks.json`.
3. **Index** – Saved embeddings are reloaded into a FAISS L2 index on demand, so `/chat` never recomputes vectors.
4. **Retrieval** – Each question is embedded, top‑k (default 4) chunks are retrieved, and the associated textbook pages are recorded as sources.
5. **Generation** – The retrieved snippets and question are sent to Gemini (with retry + safety handling) to produce a grounded answer.

### 5. Image Retrieval Logic
- Metadata for 6 diagrams lives in `images_metadata.json` (id, title, keywords, description).
- Each upload run embeds the description/keyword text once.
- When an answer is produced, the `image_retriever` combines cosine similarity (60%) and keyword/title matches (40%) to pick the most relevant diagram.
- The frontend requests `/images/file/<filename>` to render the chosen image inline with the answer and cites the supporting pages.

### 6. Prompt Used
```
You are an AI tutor helping students understand educational content.
...
Please provide a helpful answer that:
1. Directly addresses the question using information from the context
2. Is educational and easy to understand
3. Uses examples when helpful
4. Is structured clearly
5. Does not mention that you are using retrieved context
6. Stays focused on the educational content
```

### 7. Demo Flow
1. Upload `Sound.pdf` (or any chapter) via the UI.
2. Wait for “Ready for questions”; the sidebar shows the topic id + chunk count.
3. Ask questions; each response should include grounded text, cited pages, and an illustrative image.