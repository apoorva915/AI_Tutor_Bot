const API_BASE = 'http://localhost:8000';

document.addEventListener('DOMContentLoaded', () => {
    const els = {
        uploadStatus: document.getElementById('uploadStatus'),
        chatSection: document.getElementById('chatSection'),
        systemStatus: document.getElementById('systemStatus'),
        topicPill: document.getElementById('topicPill'),
        sidebarTopic: document.getElementById('sidebarTopic'),
        chunksCount: document.getElementById('chunksCount'),
        sourceCounter: document.getElementById('sourceCounter'),
        themeToggleBtn: document.getElementById('themeToggle'),
        chatMessages: document.getElementById('chatMessages'),
        userInput: document.getElementById('userInput'),
        pdfInput: document.getElementById('pdfUpload')
    };

    const state = {
        topicId: null,
        chunkCount: 0
    };

    function setTheme(theme) {
        const body = document.body;
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(`${theme}-theme`);
        localStorage.setItem('aitutor-theme', theme);
    }

    function initializeTheme() {
        const saved = localStorage.getItem('aitutor-theme');
        if (saved) {
            setTheme(saved);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(prefersDark ? 'dark' : 'light');
        }
    }

    initializeTheme();

    els.themeToggleBtn?.addEventListener('click', () => {
        const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        setTheme(nextTheme);
    });

    function updateSystemStatus(text, variant = 'idle') {
        if (!els.systemStatus) return;
        els.systemStatus.textContent = text;
        els.systemStatus.className = `status-badge ${variant !== 'idle' ? variant : ''}`.trim();
    }

    function updateTopicMeta() {
        if (els.topicPill) {
            els.topicPill.textContent = state.topicId ? `Topic: ${state.topicId}` : 'No topic loaded';
        }
        if (els.sidebarTopic) {
            els.sidebarTopic.textContent = state.topicId || '—';
        }
        if (els.chunksCount) {
            els.chunksCount.textContent = state.chunkCount ?? 0;
        }
    }

    function updateSourceCounter(count) {
        if (!els.sourceCounter) return;
        const label = count === 1 ? 'source' : 'sources';
        els.sourceCounter.textContent = `${count} ${label} referenced`;
    }

    function showChatSection() {
        els.chatSection.style.display = 'block';
    }

    async function uploadPDF() {
        if (!els.pdfInput.files.length) {
            els.uploadStatus.innerHTML = '<span style="color: #b91c1c;">Please select a PDF file</span>';
            updateSystemStatus('Awaiting file', 'error');
            return;
        }

        const file = els.pdfInput.files[0];
        const formData = new FormData();
        formData.append('file', file);

        els.uploadStatus.textContent = 'Processing PDF... This may take a moment.';
        updateSystemStatus('Processing upload', 'processing');

        try {
            const response = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            state.topicId = data.topic_id;
            state.chunkCount = data.chunks_created ?? 0;

            els.uploadStatus.innerHTML = `<span style="color: #15803d;">${data.message}. ${state.chunkCount} text chunks created.</span>`;
            updateTopicMeta();
            updateSystemStatus('Ready for questions', 'success');
            updateSourceCounter(0);

            showChatSection();
            addAIMessage("Hello! I'm your AI tutor. I've processed the PDF and I'm ready to answer your questions about the chapter. What would you like to know?");
            
        } catch (error) {
            console.error('Upload error:', error);
            els.uploadStatus.innerHTML = `<span style="color: #b91c1c;">Error uploading file: ${error.message}</span>`;
            updateSystemStatus('Upload failed', 'error');
        }
    }

    async function sendMessage() {
        const message = els.userInput.value.trim();
        
        if (!message || !state.topicId) return;

        addUserMessage(message);
        els.userInput.value = '';

        addAIMessage('Thinking...', true);

        try {
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    topic_id: state.topicId,
                    question: message
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            removeLoadingMessage();
            addAIMessage(data.answer, false, data.image_filename, data.image_title, data.sources);
            updateSourceCounter((data.sources || []).length);
            
        } catch (error) {
            console.error('Chat error:', error);
            removeLoadingMessage();
            addAIMessage("I'm sorry, I encountered an error while processing your question. Please try again.");
            updateSystemStatus('Response failed', 'error');
        }
    }

    function addUserMessage(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.textContent = message;
        els.chatMessages.appendChild(messageDiv);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    function addAIMessage(message, isLoading = false, imageFilename = null, imageTitle = null, sources = []) {
        if (isLoading) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message ai-message loading';
            loadingDiv.id = 'loadingMessage';
            loadingDiv.textContent = message;
            els.chatMessages.appendChild(loadingDiv);
        } else {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ai-message';
            
            const textDiv = document.createElement('div');
            textDiv.innerHTML = message.replace(/\n/g, '<br>');
            messageDiv.appendChild(textDiv);
            
            if (imageFilename) {
                const img = document.createElement('img');
                img.src = `${API_BASE}/images/file/${imageFilename}`;
                img.alt = imageTitle || 'Relevant diagram';
                img.loading = 'lazy';
                messageDiv.appendChild(img);
                
                if (imageTitle) {
                    const caption = document.createElement('div');
                    caption.className = 'image-caption';
                    caption.textContent = imageTitle;
                    messageDiv.appendChild(caption);
                }
            }
            
            if (sources && sources.length > 0) {
                const sourcesDiv = document.createElement('div');
                sourcesDiv.className = 'sources';
                sourcesDiv.textContent = `Sources: ${sources.join(', ')}`;
                messageDiv.appendChild(sourcesDiv);
            }
            
            els.chatMessages.appendChild(messageDiv);
        }
        
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }

    function removeLoadingMessage() {
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.remove();
        }
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            sendMessage();
        }
    }

    els.userInput?.addEventListener('keypress', handleKeyPress);

    // expose to global scope for inline handlers
    window.uploadPDF = uploadPDF;
    window.sendMessage = sendMessage;
    window.handleKeyPress = handleKeyPress;
});