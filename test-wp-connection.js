// WordPress Connection Test Script
// Run with: node test-wp-connection.js

const axios = require('axios');

// REPLACE THESE WITH YOUR ACTUAL VALUES
const WORDPRESS_CONFIG = {
  siteUrl: 'https://inscience.gr/',
  username: 'vlembessis',
  password: 'uXUC BnJV RE2C oCoa qYoJ YJTq'
};

async function testWordPressConnection() {
  console.log('🔍 Testing WordPress Connection...\n');
  
  // Test 1: Basic site access
  console.log('1️⃣ Testing site accessibility...');
  try {
    const siteResponse = await axios.get(WORDPRESS_CONFIG.siteUrl, { timeout: 10000 });
    console.log('✅ Site is accessible');
  } catch (error) {
    console.log('❌ Site not accessible:', error.message);
    return;
  }

  // Test 2: REST API endpoint
  const apiUrl = `${WORDPRESS_CONFIG.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
  console.log(`\n2️⃣ Testing REST API: ${apiUrl}`);
  
  try {
    const apiResponse = await axios.get(apiUrl, { timeout: 10000 });
    console.log('✅ WordPress REST API is accessible');
  } catch (error) {
    console.log('❌ REST API not accessible:', error.message);
    console.log('💡 Make sure WordPress REST API is enabled');
    return;
  }

  // Test 3: Authentication test
  console.log('\n3️⃣ Testing authentication...');
  try {
    const authResponse = await axios.get(`${apiUrl}/posts`, {
      auth: {
        username: WORDPRESS_CONFIG.username,
        password: WORDPRESS_CONFIG.password
      },
      params: { per_page: 1 },
      timeout: 10000
    });
    console.log('✅ Authentication successful!');
    console.log(`📊 Found ${authResponse.headers['x-wp-total']} total posts`);
  } catch (error) {
    console.log('❌ Authentication failed:', error.response?.status, error.response?.statusText);
    console.log('🔍 Response:', error.response?.data);
    
    if (error.response?.status === 401) {
      console.log('\n🚨 AUTHENTICATION ERROR - Check these:');
      console.log('• Username is correct (case-sensitive)');
      console.log('• Application password includes spaces exactly as generated');
      console.log('• Application password is not your regular WordPress password');
      console.log('• User has proper permissions (Author/Editor/Admin)');
    }
  }

  // Test 4: User permissions
  console.log('\n4️⃣ Testing user permissions...');
  try {
    const userResponse = await axios.get(`${apiUrl}/users/me`, {
      auth: {
        username: WORDPRESS_CONFIG.username,
        password: WORDPRESS_CONFIG.password
      },
      timeout: 10000
    });
    console.log('✅ User info retrieved successfully');
    console.log(`👤 User: ${userResponse.data.name} (${userResponse.data.roles.join(', ')})`);
    
    if (!userResponse.data.roles.some(role => ['administrator', 'editor', 'author'].includes(role))) {
      console.log('⚠️  Warning: User may not have sufficient permissions to create posts');
    }
  } catch (error) {
    console.log('❌ Could not retrieve user info:', error.response?.status);
  }
}

// Update the config above and run: node test-wp-connection.js
testWordPressConnection(); 