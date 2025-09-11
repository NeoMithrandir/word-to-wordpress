// Test script to directly test the publish endpoint
const axios = require('axios');

const testPublish = async () => {
  console.log('Testing publish endpoint...\n');
  
  // Test content - minimal valid structure
  const testData = {
    content: {
      title: 'Test Post from API',
      content: '<p>This is a test post from the Word to WordPress converter.</p>',
      excerpt: 'Test excerpt',
      footnotes: [],
      citations: [],
      images: [],
      wordCount: 10
    },
    wpConfig: {
      siteUrl: 'https://inscience.gr/',
      username: 'nesimk',
      password: 'KMo5 cJRa lJqe JZUQ rVfo k08ms'
    },
    postData: {
      title: 'Test Post from API',
      status: 'draft',
      excerpt: 'Test excerpt'
    }
  };

  try {
    console.log('Sending test publish request...');
    const response = await axios.post('http://localhost:3007/api/publish', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Publish successful!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Publish failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
};

testPublish(); 