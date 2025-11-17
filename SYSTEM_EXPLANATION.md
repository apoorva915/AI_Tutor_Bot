# AI Tutor Bot - Complete System Explanation

## 📚 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Complete System Flow](#complete-system-flow)
4. [Backend Implementation Details](#backend-implementation-details)
5. [Frontend Implementation Details](#frontend-implementation-details)
6. [RAG Pipeline Deep Dive](#rag-pipeline-deep-dive)
7. [Image Retrieval System](#image-retrieval-system)
8. [How Everything Works Together](#how-everything-works-together)

---

## System Overview

### What is This System?
This is an **AI Tutor Chatbot** that:
- Reads PDF chapters (like textbook chapters)
- Answers questions using information from the PDF
- Automatically shows relevant diagrams/images with each answer

### Key Technologies Used
- **FastAPI**: Python web framework for the backend API
- **PyMuPDF (fitz)**: Extracts text from PDF files
- **Sentence Transformers**: Creates embeddings (vector representations) of text
- **FAISS**: Fast vector database for similarity search
- **Google Gemini**: Large Language Model (LLM) that generates answers
- **HTML/CSS/JavaScript**: Frontend user interface

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  HTML UI     │  │  JavaScript   │  │   CSS Styles  │     │
│  │  (index.html)│  │  (script.js)  │  │  (style.css)  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘     │
└─────────┼──────────────────┼────────────────────────────────┘
          │                  │
          │ HTTP Requests    │
          │ (POST/GET)       │
          ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND API                           │
│                    (FastAPI - main.py)                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  /upload     │  │    /chat     │  │  /images/*   │     │
│  │  Endpoint    │  │   Endpoint   │  │  Endpoints   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────────────┐  ┌──────────────┐
│   utils.py   │  │   rag.py            │  │image_retrieval│
│  - PDF Text  │  │  - Embeddings       │  │     .py      │
│  - Chunking  │  │  - FAISS Index      │  │  - Image     │
│  - Storage   │  │  - Retrieval        │  │    Matching  │
│              │  │  - Answer Gen       │  │              │
└──────────────┘  └──────────────────────┘  └──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA STORAGE                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  JSON Files  │  │  FAISS Index │  │  Image Files │     │
│  │  (Chunks +   │  │  (In Memory) │  │  (PNG/JPG)   │     │
│  │   Images)    │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete System Flow

### Phase 1: PDF Upload & Processing

#### Step 1: User Uploads PDF
```
User → Frontend → Selects PDF file → Clicks "Process PDF"
```

**Frontend Code** (`script.js`):
```javascript
async function uploadPDF() {
    const file = els.pdfInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    // Send to backend
    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
    });
}
```

#### Step 2: Backend Receives PDF
**Backend Code** (`main.py`, line 95-108):
```python
@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    # 1. Validate it's a PDF
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # 2. Save file to uploads/ folder
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
```

#### Step 3: Extract Text from PDF
**Backend Code** (`main.py`, line 111-114):
```python
# Extract text from each page
pages_text = extract_text_from_pdf(file_path)
```

**What happens inside** (`utils.py`, line 7-22):
```python
def extract_text_from_pdf(pdf_path: str) -> List[Dict[str, Any]]:
    doc = fitz.open(pdf_path)  # Open PDF with PyMuPDF
    pages_text = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()  # Extract text from page
        if text.strip():
            pages_text.append({
                "page_number": page_num + 1,
                "text": text.strip()
            })
    
    doc.close()
    return pages_text
```

**Result**: List of dictionaries, one per page:
```python
[
    {"page_number": 1, "text": "Sound is a form of energy..."},
    {"page_number": 2, "text": "When a bell vibrates..."},
    ...
]
```

#### Step 4: Create Text Chunks
**Why chunking?** 
- PDFs are too long to send to LLM all at once
- We need smaller pieces for better retrieval
- Overlapping chunks ensure context isn't lost at boundaries

**Backend Code** (`main.py`, line 117):
```python
chunks = create_text_chunks(pages_text)
```

**What happens inside** (`utils.py`, line 24-62):
```python
def create_text_chunks(pages_text: List[Dict], chunk_size: int = 500, overlap: int = 50):
    chunks = []
    chunk_id = 0
    
    for page in pages_text:
        text = page["text"]
        page_num = page["page_number"]
        
        # Split by sentences
        sentences = text.split('. ')
        
        current_chunk = ""
        for sentence in sentences:
            # If adding this sentence keeps chunk under 500 chars
            if len(current_chunk + sentence) < chunk_size:
                current_chunk += sentence + ". "
            else:
                # Save current chunk
                chunks.append({
                    "id": f"chunk_{chunk_id}",
                    "text": current_chunk.strip(),
                    "page": page_num
                })
                chunk_id += 1
                
                # Overlap: keep last 3 sentences for context
                current_chunk = ". ".join(current_chunk.split(". ")[-3:]) + sentence + ". "
    
    return chunks
```

**Result**: Smaller text pieces:
```python
[
    {"id": "chunk_0", "text": "Sound is a form of energy...", "page": 1},
    {"id": "chunk_1", "text": "...vibrations travel through...", "page": 1},
    ...
]
```

#### Step 5: Generate Embeddings
**What are embeddings?**
- Embeddings are numerical vectors (arrays of numbers) that represent text
- Similar texts have similar vectors
- We can find similar texts by comparing vectors

**Backend Code** (`main.py`, line 125):
```python
rag_pipeline.create_embeddings(chunks, regenerate=True)
```

**What happens inside** (`rag.py`, line 68-93):
```python
def create_embeddings(self, chunks: List[Dict], regenerate: bool = False):
    self.chunks = chunks
    
    # Check if embeddings already exist
    missing_embeddings = regenerate or any("embeddings" not in chunk for chunk in chunks)
    
    if missing_embeddings:
        # Extract just the text from chunks
        texts = [chunk["text"] for chunk in chunks]
        
        # Generate embeddings using SentenceTransformer
        # This converts text → vector of 384 numbers
        embeddings = self.embedding_model.encode(texts)
        
        # Store embedding in each chunk
        for chunk, embedding in zip(chunks, embeddings):
            chunk["embeddings"] = embedding.astype(float).tolist()
    
    # Build FAISS index for fast similarity search
    embeddings_matrix = np.array(
        [chunk["embeddings"] for chunk in chunks],
        dtype="float32"
    )
    dimension = embeddings_matrix.shape[1]  # Usually 384
    
    # Create FAISS index (L2 distance = Euclidean distance)
    self.vector_store = faiss.IndexFlatL2(dimension)
    self.vector_store.add(embeddings_matrix)
```

**Result**: Each chunk now has an embedding:
```python
{
    "id": "chunk_0",
    "text": "Sound is a form of energy...",
    "page": 1,
    "embeddings": [0.123, -0.456, 0.789, ..., 0.234]  # 384 numbers
}
```

#### Step 6: Load Image Metadata
**Backend Code** (`main.py`, line 129-136):
```python
# Discover images from images folder
image_metadata = discover_images_from_folder("images")

# Load into image retriever
image_retriever.load_image_metadata(image_metadata)
```

**What happens** (`utils.py`, line 96-175):
1. Looks for `images_metadata.json` file
2. If found, loads the metadata
3. If not, scans `images/` folder and auto-generates metadata

**Image Metadata Structure** (`images_metadata.json`):
```json
{
  "images": [
    {
      "id": "img_001",
      "filename": "SchoolBellVibration.png",
      "title": "School Bell Vibration",
      "keywords": ["bell", "vibration", "sound", "waves"],
      "description": "Diagram showing how a school bell vibrates..."
    },
    ...
  ]
}
```

**Image Embeddings** (`image_retrieval.py`, line 12-27):
```python
def load_image_metadata(self, image_metadata: List[Dict]):
    self.image_metadata = image_metadata
    
    # Create text representation: description + keywords + title
    texts_to_embed = []
    for img in image_metadata:
        text = f"{img['description']} {' '.join(img['keywords'])} {img['title']}"
        texts_to_embed.append(text)
    
    # Generate embeddings for each image's text
    self.image_embeddings = self.embedding_model.encode(texts_to_embed)
```

#### Step 7: Save Everything to Disk
**Backend Code** (`main.py`, line 139):
```python
save_embeddings(topic_id, chunks, image_metadata)
```

**What happens** (`utils.py`, line 71-81):
```python
def save_embeddings(topic_id: str, chunks: List[Dict], image_metadata: List[Dict]):
    os.makedirs("data/embeddings", exist_ok=True)
    
    # Save chunks with embeddings
    with open(f"data/embeddings/{topic_id}_chunks.json", "w") as f:
        json.dump(chunks, f, indent=2)
    
    # Save image metadata
    with open(f"data/embeddings/{topic_id}_images.json", "w") as f:
        json.dump(image_metadata, f, indent=2)
```

**Result**: Files saved:
- `data/embeddings/Sound_1234567890_chunks.json`
- `data/embeddings/Sound_1234567890_images.json`

#### Step 8: Return Response to Frontend
**Backend Code** (`main.py`, line 164-168):
```python
return UploadResponse(
    topic_id=topic_id,  # e.g., "Sound_1234567890"
    message="PDF processed successfully",
    chunks_created=len(chunks)  # e.g., 45
)
```

**Frontend receives** (`script.js`, line 99-109):
```javascript
const data = await response.json();
state.topicId = data.topic_id;
state.chunkCount = data.chunks_created;

// Show success message
els.uploadStatus.innerHTML = `<span>PDF processed. ${state.chunkCount} chunks created.</span>`;
updateSystemStatus('Ready for questions', 'success');
showChatSection();  // Show chat interface
```

---

### Phase 2: User Asks a Question

#### Step 1: User Types Question
**Frontend Code** (`script.js`, line 118-124):
```javascript
async function sendMessage() {
    const message = els.userInput.value.trim();  // Get question
    
    if (!message || !state.topicId) return;
    
    addUserMessage(message);  // Show user's question in chat
    els.userInput.value = '';  // Clear input
    
    addAIMessage('Thinking...', true);  // Show loading message
```

#### Step 2: Frontend Sends Request
**Frontend Code** (`script.js`, line 129-138):
```javascript
const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        topic_id: state.topicId,  // e.g., "Sound_1234567890"
        question: message  // e.g., "How does sound travel?"
    })
});
```

#### Step 3: Backend Receives Question
**Backend Code** (`main.py`, line 174-183):
```python
@app.post("/chat")
async def chat(request: ChatRequest):
    # Load saved chunks and images for this topic
    chunks, images = load_embeddings(request.topic_id)
    if chunks is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Set up RAG pipeline with loaded chunks
    rag_pipeline.chunks = chunks
    rag_pipeline.create_embeddings(chunks)  # Rebuild FAISS index
```

**What `load_embeddings` does** (`utils.py`, line 83-94):
```python
def load_embeddings(topic_id: str) -> tuple:
    try:
        # Load chunks from JSON file
        with open(f"data/embeddings/{topic_id}_chunks.json", "r") as f:
            chunks = json.load(f)
        
        # Load images from JSON file
        with open(f"data/embeddings/{topic_id}_images.json", "r") as f:
            images = json.load(f)
        
        return chunks, images
    except FileNotFoundError:
        return None, None
```

#### Step 4: Retrieve Relevant Chunks (RAG Core)
**Backend Code** (`main.py`, line 226):
```python
relevant_chunks = rag_pipeline.retrieve_chunks(request.question, k=4)
```

**What happens inside** (`rag.py`, line 95-112):
```python
def retrieve_chunks(self, query: str, k: int = 4) -> List[Dict]:
    if self.vector_store is None:
        return []
    
    # Step 1: Convert question to embedding
    query_embedding = self.embedding_model.encode([query])
    # Result: [0.234, -0.123, 0.567, ..., 0.890] (384 numbers)
    
    # Step 2: Search FAISS index for similar chunks
    # FAISS compares query embedding with all chunk embeddings
    # Returns top-k most similar chunks
    distances, indices = self.vector_store.search(
        query_embedding.astype('float32'), 
        k  # Get top 4
    )
    
    # Step 3: Get actual chunk objects
    relevant_chunks = []
    for idx in indices[0]:
        if idx < len(self.chunks):
            relevant_chunks.append(self.chunks[idx])
    
    return relevant_chunks
```

**How FAISS Search Works**:
1. Query: "How does sound travel?"
2. Convert to embedding: `[0.234, -0.123, ...]`
3. Compare with all chunk embeddings using L2 distance
4. Find 4 chunks with smallest distances (most similar)
5. Return those chunks

**Result**: Top 4 most relevant chunks from the PDF

#### Step 5: Generate Answer Using LLM
**Backend Code** (`main.py`, line 234):
```python
answer = rag_pipeline.generate_answer(request.question, relevant_chunks)
```

**What happens inside** (`rag.py`, line 204-233):
```python
def generate_answer(self, question: str, relevant_chunks: List[Dict]) -> str:
    # Step 1: Prepare context from retrieved chunks
    context = "\n\n".join([
        f"Source {i+1} (Page {chunk['page']}): {chunk['text']}" 
        for i, chunk in enumerate(relevant_chunks)
    ])
    
    # Step 2: Create prompt
    system_prompt = """You are an AI tutor helping students understand educational content. 
Your role is to provide clear, accurate, and helpful explanations based on the provided textbook context."""

    user_prompt = f"""Based on the following context from the textbook, please answer the student's question:

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

Answer:"""
    
    full_prompt = f"{system_prompt}\n\n{user_prompt}"
    
    # Step 3: Send to Gemini LLM
    return self.generate_answer_with_retry(full_prompt)
```

**What `generate_answer_with_retry` does** (`rag.py`, line 114-202):
```python
def generate_answer_with_retry(self, prompt: str, max_retries: int = 3) -> str:
    for attempt in range(max_retries):
        try:
            # Call Gemini API
            response = self.llm_model.generate_content(prompt)
            
            # Check if response was blocked
            if not response.parts:
                return "I cannot answer this question due to content safety restrictions."
            
            # Get response text
            response_text = response.text
            return response_text
            
        except Exception as e:
            # Handle rate limits with exponential backoff
            if "rate limit" in str(e).lower():
                wait_time = (2 ** attempt)  # 1s, 2s, 4s
                time.sleep(wait_time)
                continue
            # Handle other errors...
    
    return "I apologize, but I'm currently experiencing technical difficulties."
```

**Result**: Generated answer text from Gemini

#### Step 6: Find Relevant Image
**Backend Code** (`main.py`, line 238):
```python
relevant_image = image_retriever.find_relevant_image(answer, request.question)
```

**What happens inside** (`image_retrieval.py`, line 29-130):
```python
def find_relevant_image(self, answer_text: str, question: str = "") -> Optional[Dict]:
    # Step 1: Combine question + answer for context
    search_text = f"{question} {answer_text}"
    
    # Step 2: Convert to embedding
    search_embedding = self.embedding_model.encode([search_text])
    
    # Step 3: Calculate cosine similarity with all image embeddings
    search_norm = search_embedding / (np.linalg.norm(search_embedding, axis=1, keepdims=True) + 1e-8)
    image_norms = self.image_embeddings / (np.linalg.norm(self.image_embeddings, axis=1, keepdims=True) + 1e-8)
    similarities = np.dot(image_norms, search_norm.T).flatten()
    
    # Step 4: Keyword matching (boost score for keyword matches)
    keyword_scores = []
    for img in self.image_metadata:
        keyword_match_score = 0.0
        
        # Check if keywords appear in question/answer
        for keyword in img['keywords']:
            if keyword.lower() in combined_text.lower():
                keyword_match_score += 0.25
        
        # Check title matches
        for word in img['title'].lower().split():
            if word in combined_text.lower():
                keyword_match_score += 0.25
        
        keyword_scores.append(keyword_match_score)
    
    # Step 5: Combine scores (60% embedding, 40% keywords)
    final_scores = 0.6 * similarities + 0.4 * keyword_scores
    
    # Step 6: Return image with highest score
    best_match_idx = np.argmax(final_scores)
    return self.image_metadata[best_match_idx]
```

**Result**: Most relevant image metadata

#### Step 7: Prepare Response
**Backend Code** (`main.py`, line 247-261):
```python
# Extract page numbers from chunks
sources = [f"Page {chunk['page']}" for chunk in relevant_chunks]

response = ChatResponse(
    answer=answer,  # Generated text
    image_id=relevant_image["id"] if relevant_image else None,
    image_filename=relevant_image["filename"] if relevant_image else None,
    image_title=relevant_image["title"] if relevant_image else None,
    sources=list(set(sources))  # Remove duplicates: ["Page 1", "Page 3"]
)
return response
```

#### Step 8: Frontend Displays Response
**Frontend Code** (`script.js`, line 144-148):
```javascript
const data = await response.json();

removeLoadingMessage();  // Remove "Thinking..." message
addAIMessage(
    data.answer,  // Answer text
    false, 
    data.image_filename,  // Image to show
    data.image_title,  // Image caption
    data.sources  // ["Page 1", "Page 3"]
);
```

**What `addAIMessage` does** (`script.js`, line 166-207):
```javascript
function addAIMessage(message, isLoading = false, imageFilename = null, imageTitle = null, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    
    // Add answer text
    const textDiv = document.createElement('div');
    textDiv.innerHTML = message.replace(/\n/g, '<br>');
    messageDiv.appendChild(textDiv);
    
    // Add image if available
    if (imageFilename) {
        const img = document.createElement('img');
        img.src = `${API_BASE}/images/file/${imageFilename}`;  // Load from backend
        img.alt = imageTitle || 'Relevant diagram';
        messageDiv.appendChild(img);
        
        // Add caption
        if (imageTitle) {
            const caption = document.createElement('div');
            caption.className = 'image-caption';
            caption.textContent = imageTitle;
            messageDiv.appendChild(caption);
        }
    }
    
    // Add sources
    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'sources';
        sourcesDiv.textContent = `Sources: ${sources.join(', ')}`;
        messageDiv.appendChild(sourcesDiv);
    }
    
    els.chatMessages.appendChild(messageDiv);
}
```

**Result**: User sees:
- Answer text
- Relevant image
- Image caption
- Source pages

---

## Backend Implementation Details

### File Structure
```
backend/
├── app/
│   ├── main.py           # FastAPI app, endpoints
│   ├── rag.py            # RAG pipeline (embeddings, retrieval, LLM)
│   ├── image_retrieval.py # Image matching logic
│   ├── utils.py          # PDF extraction, chunking, file I/O
│   └── models.py         # Pydantic data models
├── data/
│   ├── embeddings/       # Saved chunks and images (JSON)
│   └── images/           # Copied image files
└── uploads/              # Uploaded PDFs
```

### Key Components

#### 1. `main.py` - FastAPI Application
**Purpose**: Main API server with 3 endpoints

**Endpoints**:
- `POST /upload`: Process PDF upload
- `POST /chat`: Handle chat questions
- `GET /images/file/{filename}`: Serve image files

**CORS Setup** (line 52-58):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (for development)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**Why**: Frontend runs on different port (5500), backend on (8000). CORS allows cross-origin requests.

#### 2. `rag.py` - RAG Pipeline Class
**Purpose**: Handles all RAG operations

**Key Methods**:
- `create_embeddings()`: Generate embeddings and build FAISS index
- `retrieve_chunks()`: Find similar chunks using vector search
- `generate_answer()`: Create prompt and call Gemini LLM
- `generate_answer_with_retry()`: Handle API errors and rate limits

**Embedding Model**: `all-MiniLM-L6-v2`
- Open-source, free
- 384-dimensional vectors
- Fast and accurate

**LLM Model**: Google Gemini
- Tries multiple model names for compatibility
- Configured with safety settings
- Handles rate limiting with exponential backoff

#### 3. `image_retrieval.py` - Image Retriever Class
**Purpose**: Find most relevant image for each answer

**Hybrid Approach**:
1. **Embedding Similarity** (60% weight)
   - Converts question + answer to embedding
   - Compares with image embeddings (from description + keywords)
   - Uses cosine similarity

2. **Keyword Matching** (40% weight)
   - Checks if image keywords appear in question/answer
   - Checks title matches
   - Handles word variations (e.g., "reflect" matches "reflection")

**Why Hybrid?**
- Embeddings catch semantic similarity
- Keywords catch exact term matches
- Combined = better accuracy

#### 4. `utils.py` - Utility Functions
**Purpose**: Helper functions for PDF processing and file management

**Key Functions**:
- `extract_text_from_pdf()`: Uses PyMuPDF to extract text
- `create_text_chunks()`: Splits text into overlapping chunks
- `save_embeddings()`: Persists data to JSON files
- `load_embeddings()`: Loads saved data
- `discover_images_from_folder()`: Finds and loads image metadata

#### 5. `models.py` - Data Models
**Purpose**: Define request/response structures using Pydantic

**Models**:
```python
class UploadResponse(BaseModel):
    topic_id: str
    message: str
    chunks_created: int

class ChatRequest(BaseModel):
    topic_id: str
    question: str

class ChatResponse(BaseModel):
    answer: str
    image_id: Optional[str]
    image_filename: Optional[str]
    image_title: Optional[str]
    sources: List[str]
```

**Why Pydantic?**
- Automatic validation
- Type checking
- Auto-generates API documentation

---

## Frontend Implementation Details

### File Structure
```
frontend/
├── index.html    # HTML structure
├── script.js     # JavaScript logic
└── style.css     # Styling (not shown, but exists)
```

### Key Components

#### 1. `index.html` - UI Structure
**Sections**:
- Header: Title, status badge, theme toggle
- Info Cards: Explains the 3-step process
- Upload Panel: File input and process button
- Chat Section: Message display and input
- Tips Panel: Sidebar with tips and metadata

#### 2. `script.js` - Frontend Logic
**State Management**:
```javascript
const state = {
    topicId: null,      // Current topic ID
    chunkCount: 0       // Number of chunks created
};
```

**Key Functions**:
- `uploadPDF()`: Handles PDF upload
- `sendMessage()`: Sends question to backend
- `addUserMessage()`: Displays user's question
- `addAIMessage()`: Displays AI response with image
- `updateSystemStatus()`: Updates status badge

**Theme Toggle**:
- Stores preference in `localStorage`
- Supports light/dark themes
- Respects system preference on first load

**API Communication**:
- All requests go to `http://localhost:8000`
- Uses `fetch()` API for HTTP requests
- Handles errors gracefully

---

## RAG Pipeline Deep Dive

### What is RAG?
**RAG = Retrieval-Augmented Generation**

Traditional LLM:
```
User Question → LLM → Answer (may be wrong/hallucinated)
```

RAG:
```
User Question → Find Relevant Context → LLM (with context) → Grounded Answer
```

### RAG Steps in This System

#### 1. **Indexing Phase** (During Upload)
```
PDF → Text Extraction → Chunking → Embeddings → FAISS Index
```

#### 2. **Retrieval Phase** (During Chat)
```
User Question → Embedding → FAISS Search → Top-K Chunks
```

#### 3. **Generation Phase** (During Chat)
```
Question + Retrieved Chunks → Prompt → Gemini LLM → Answer
```

### Why This Works

**Problem**: LLMs can hallucinate (make up facts)

**Solution**: 
1. Only retrieve chunks from the actual PDF
2. Send those chunks as context to LLM
3. LLM generates answer based on provided context
4. Answer is "grounded" in the source material

**Example**:
- Question: "How does sound travel?"
- Retrieved chunks: 4 chunks about sound waves, vibration, medium
- LLM sees: Question + these 4 chunks
- LLM generates: Answer using only information from those chunks
- Result: Accurate, grounded answer

---

## Image Retrieval System

### How Images Are Matched

#### Step 1: Image Metadata Preparation
Each image has:
- **Title**: "School Bell Vibration"
- **Keywords**: ["bell", "vibration", "sound", "waves"]
- **Description**: "Diagram showing how a school bell vibrates..."

#### Step 2: Create Image Embeddings
```python
text = f"{description} {' '.join(keywords)} {title}"
embedding = embedding_model.encode(text)
```

#### Step 3: During Chat
When user asks a question and gets an answer:

1. **Combine question + answer**:
   ```
   "How does sound travel? Sound travels through vibrations in a medium..."
   ```

2. **Convert to embedding**:
   ```
   [0.234, -0.123, 0.567, ...]
   ```

3. **Calculate similarity with all images**:
   ```
   Image 1: 0.85 similarity
   Image 2: 0.72 similarity
   Image 3: 0.91 similarity ← Highest!
   ```

4. **Keyword boost**:
   - Check if image keywords appear in text
   - Boost score for matches

5. **Final score**:
   ```
   Final = 0.6 × Embedding Similarity + 0.4 × Keyword Score
   ```

6. **Return best match**

### Why This Works
- **Semantic matching**: Embeddings understand meaning, not just keywords
- **Keyword boost**: Catches exact term matches
- **Combined approach**: More accurate than either alone

---

## How Everything Works Together

### Complete Flow Example

**Scenario**: User uploads "Sound.pdf" and asks "How does a bell produce sound?"

#### 1. Upload Phase
```
User uploads Sound.pdf
  ↓
Backend extracts text: 10 pages
  ↓
Creates 45 chunks (500 chars each, overlapping)
  ↓
Generates 45 embeddings (384 numbers each)
  ↓
Builds FAISS index
  ↓
Loads 6 images with metadata
  ↓
Generates 6 image embeddings
  ↓
Saves everything to JSON files
  ↓
Returns: topic_id = "Sound_1234567890"
```

#### 2. Chat Phase
```
User asks: "How does a bell produce sound?"
  ↓
Frontend sends: {topic_id: "Sound_1234567890", question: "How does a bell produce sound?"}
  ↓
Backend loads chunks and images for topic
  ↓
Rebuilds FAISS index
  ↓
Converts question to embedding
  ↓
FAISS finds top 4 similar chunks:
  - Chunk 12: "When a bell is struck, it vibrates..."
  - Chunk 8: "Vibrations create sound waves..."
  - Chunk 15: "The frequency of vibration determines..."
  - Chunk 3: "Sound requires a medium to travel..."
  ↓
Creates prompt with these 4 chunks
  ↓
Sends to Gemini LLM
  ↓
Gemini generates answer: "A bell produces sound when it is struck and begins to vibrate. These vibrations create sound waves that travel through the air..."
  ↓
Image retriever compares answer + question with all 6 images
  ↓
Finds: "SchoolBellVibration.png" (highest score: 0.92)
  ↓
Returns response:
  {
    answer: "A bell produces sound...",
    image_filename: "SchoolBellVibration.png",
    image_title: "School Bell Vibration",
    sources: ["Page 2", "Page 3", "Page 5"]
  }
  ↓
Frontend displays:
  - Answer text
  - SchoolBellVibration.png image
  - "Sources: Page 2, Page 3, Page 5"
```

---

## Key Design Decisions

### 1. Why FAISS Instead of Just JSON?
- **FAISS**: Fast similarity search (milliseconds)
- **JSON search**: Would need to compare every chunk (seconds)
- **Trade-off**: FAISS index is rebuilt on each chat (acceptable for small datasets)

### 2. Why Overlapping Chunks?
- Prevents losing context at chunk boundaries
- Example: Sentence split between chunks → overlap ensures it's in both

### 3. Why Hybrid Image Retrieval?
- **Embeddings alone**: Might miss exact keyword matches
- **Keywords alone**: Might miss semantic similarity
- **Combined**: Best of both worlds

### 4. Why Store Embeddings in JSON?
- **Requirement**: Local storage (no cloud DB)
- **JSON**: Simple, human-readable, easy to debug
- **Alternative**: Could use SQLite, but JSON is simpler for this use case

### 5. Why Sentence-Based Chunking?
- **Simple**: Easy to implement
- **Effective**: Works well for educational content
- **Alternative**: Could use semantic chunking (more complex)

---
