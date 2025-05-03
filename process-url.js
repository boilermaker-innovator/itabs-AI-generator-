
// netlify/functions/process-url.js
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

exports.handler = async function(event, context) {
  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Parse request body
    const data = JSON.parse(event.body);
    const { url, contentType } = data;

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: 'URL is required' }) };
    }

    // Fetch webpage content
    console.log(`Fetching content from: ${url}`);
    const response = await axios.get(url);
    const html = response.data;

    // Extract text content using JSDOM
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract title
    const title = document.querySelector('title')?.textContent || '';
    
    // Extract main content (simplistic approach - would need refinement for production)
    let mainContent = '';
    const articles = document.querySelectorAll('article, main, .content, .main-content');
    
    if (articles.length > 0) {
      // Use the first matched main content area
      mainContent = articles[0].textContent;
    } else {
      // Fallback to body if no specific content area found
      mainContent = document.body.textContent;
    }
    
    // Clean and truncate the content (to avoid exceeding token limits)
    mainContent = mainContent
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 10000);

    // Prepare data for AI processing
    console.log('Generating iTabs content...');
    
    // Create appropriate prompts based on content type
    let prompt = '';
    
    if (contentType === 'product') {
      prompt = `
        Analyze this product page content and generate structured iTabs content with the following tabs:
        1. Overview: Brief summary of the product with key highlights
        2. Features: Bullet points of main features and benefits
        3. Specifications: Technical details in a table format (if applicable)
        4. Reviews: Summary of customer opinions (if available)
        
        URL: ${url}
        Page Title: ${title}
        Content: ${mainContent}
        
        Format the response as JSON with keys for each tab section. For the specifications, create a structured array of spec items.
      `;
    } else if (contentType === 'article') {
      prompt = `
        Analyze this article content and generate structured iTabs content with the following tabs:
        1. Summary: Brief overview of the article's main points
        2. Key Points: Important takeaways organized as bullet points
        3. Resources: Any mentioned resources, tools, or additional reading
        4. Related: Suggested related topics based on the content
        
        URL: ${url}
        Page Title: ${title}
        Content: ${mainContent}
        
        Format the response as JSON with keys for each tab section.
      `;
    } else if (contentType === 'service') {
      prompt = `
        Analyze this service page content and generate structured iTabs content with the following tabs:
        1. Overview: Brief description of the service offered
        2. Process: How the service works or is delivered, as steps if possible
        3. Pricing: Information about costs or packages (if available)
        4. Testimonials: Any customer quotes or success cases mentioned (if available)
        
        URL: ${url}
        Page Title: ${title}
        Content: ${mainContent}
        
        Format the response as JSON with keys for each tab section.
      `;
    } else {
      prompt = `
        Analyze this webpage content and generate appropriate iTabs content for it.
        Determine what type of content this is and create relevant tabs.
        
        URL: ${url}
        Page Title: ${title}
        Content: ${mainContent}
        
        Format the response as JSON with keys for each tab section.
      `;
    }

    // Call OpenAI API to generate structured content
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: "You are an expert content analyzer that extracts and organizes information from webpages into structured, concise iTabs content. You output only valid JSON."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    // Extract and return the structured iTabs content
    const structuredContent = aiResponse.choices[0].message.content;
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: structuredContent
    };

  } catch (error) {
    console.error("Error processing URL:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Error processing URL", 
        message: error.message 
      })
    };
  }
};
```

3. Next, you'll need to create a `package.json` file in your project root with these dependencies:

```json
{
  "name": "itabs-ai-generator",
  "version": "1.0.0",
  "description": "AI-powered iTabs content generator",
  "main": "index.html",
  "dependencies": {
    "axios": "^1.6.2",
    "jsdom": "^22.1.0",
    "openai": "^4.17.0"
  }
}
```

4. Now, update your HTML file to connect to the function:

In your main `index.html` file, find the script section at the bottom and replace it with:

```javascript
<script>
    // Tab switching functionality
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Show corresponding content
            const tabId = this.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Form submission
    document.getElementById('itabs-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Get form values
        const url = document.getElementById('url-input').value;
        const contentType = document.getElementById('content-type').value;
        const additionalInfo = document.getElementById('additional-info').value;
        
        // Show loading indicator
        document.getElementById('loading-indicator').style.display = 'block';
        document.getElementById('preview-content').style.display = 'none';
        
        try {
            // Call Netlify function
            const response = await fetch('/.netlify/functions/process-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url,
                    contentType,
                    additionalInfo
                })
            });
            
            if (!response.ok) {
                throw new Error('Error processing URL');
            }
            
            const data = await response.json();
            
            // Update preview with generated content
            updatePreview(data, url);
            
            // Hide loading indicator
            document.getElementById('loading-indicator').style.display = 'none';
            document.getElementById('preview-content').style.display = 'block';
            
            // Show tabs preview and code section
            document.getElementById('tabs-preview').style.display = 'block';
            document.getElementById('code-section').style.display = 'block';
        } catch (error) {
            console.error('Error:', error);
            // Hide loading indicator
            document.getElementById('loading-indicator').style.display = 'none';
            document.getElementById('preview-content').style.display = 'block';
            document.getElementById('preview-content').innerHTML = `
                <p>Error processing URL: ${error.message}</p>
                <p>Please try a different URL or try again later.</p>
            `;
        }
    });

    // Update preview with generated content
    function updatePreview(data, sourceUrl) {
        // Update tab headings if needed
        updateTabHeadings(data);
        
        // Update tab contents
        if (data.overview) document.getElementById('overview').innerHTML = data.overview;
        if (data.features) document.getElementById('features').innerHTML = data.features;
        if (data.specs) document.getElementById('specs').innerHTML = data.specs;
        if (data.reviews) document.getElementById('reviews').innerHTML = data.reviews;
        
        // For article content
        if (data.summary) document.getElementById('overview').innerHTML = data.summary;
        if (data.keyPoints) document.getElementById('features').innerHTML = data.keyPoints;
        
        // Generate embed code
        const title = document.querySelector('#overview h3')?.textContent || 'Generated Content';
        generateEmbedCode(title, sourceUrl);
    }
    
    // Update tab headings based on content type
    function updateTabHeadings(data) {
        const tabs = document.querySelectorAll('#tabs-preview .tab');
        
        // Check what keys exist in the data to determine content type
        if (data.summary && data.keyPoints) {
            // Article content
            tabs[0].textContent = 'Summary';
            tabs[1].textContent = 'Key Points';
            tabs[2].textContent = 'Resources';
            tabs[3].textContent = 'Related';
        } else if (data.process && data.pricing) {
            // Service content
            tabs[0].textContent = 'Overview';
            tabs[1].textContent = 'Process';
            tabs[2].textContent = 'Pricing';
            tabs[3].textContent = 'Testimonials';
        } else {
            // Default Product content
            tabs[0].textContent = 'Overview';
            tabs[1].textContent = 'Features';
            tabs[2].textContent = 'Specifications';
            tabs[3].textContent = 'Reviews';
        }
    }
    
    // Generate embed code
    function generateEmbedCode(title, sourceUrl) {
        const tabLabels = Array.from(document.querySelectorAll('#tabs-preview .tab')).map(tab => tab.textContent);
        
        const embedCode = `<!-- iTabs Embed Code for ${title} -->
<div class="itabs-container" data-itabs-id="generated-${Date.now()}">
  <div class="itabs-nav">
    <button class="itab-button active" data-tab="tab1">${tabLabels[0]}</button>
    <button class="itab-button" data-tab="tab2">${tabLabels[1]}</button>
    <button class="itab-button" data-tab="tab3">${tabLabels[2]}</button>
    <button class="itab-button" data-tab="tab4">${tabLabels[3]}</button>
  </div>
  <div class="itabs-content">
    <div class="itab-pane active" id="tab1">
      ${document.getElementById('overview').innerHTML}
    </div>
    <div class="itab-pane" id="tab2">
      ${document.getElementById('features').innerHTML}
    </div>
    <div class="itab-pane" id="tab3">
      ${document.getElementById('specs').innerHTML}
    </div>
    <div class="itab-pane" id="tab4">
      ${document.getElementById('reviews').innerHTML}
    </div>
  </div>
  <a href="${sourceUrl}" class="itabs-source-link">View Original Source →</a>
</div>
<script src="https://itabs.co/embed.js"></script>`;
        
        document.getElementById('generated-code').textContent = embedCode;
    }

    // Copy code functionality
    document.getElementById('copy-code').addEventListener('click', function() {
        const codeElement = document.getElementById('generated-code');
        const textArea = document.createElement('textarea');
        textArea.value = codeElement.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Show success message
        const successMessage = document.getElementById('copy-success');
        successMessage.style.display = 'block';
        setTimeout(function() {
            successMessage.style.display = 'none';
        }, 2000);
    });
</script>
