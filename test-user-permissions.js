// Test user permissions and capabilities
const axios = require('axios');

const checkUserPermissions = async () => {
  const config = {
    siteUrl: 'https://inscience.gr/',
    username: 'nesimk',
    password: 'KMo5 cJRa lJqe JZUQ rVfo k08ms'
  };
  
  const apiUrl = `${config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
  
  console.log('🔍 Checking user permissions for:', config.username);
  console.log('Site:', config.siteUrl);
  console.log('');
  
  try {
    // Test 1: Basic authentication
    console.log('1️⃣ Testing basic authentication...');
    const authTest = await axios.get(`${apiUrl}/posts`, {
      auth: {
        username: config.username,
        password: config.password
      },
      params: { per_page: 1 }
    });
    console.log('✅ Authentication works');
    console.log('');
    
    // Test 2: Try to get user info
    console.log('2️⃣ Getting user information...');
    try {
      const userResponse = await axios.get(`${apiUrl}/users/me`, {
        auth: {
          username: config.username,
          password: config.password
        }
      });
      console.log('✅ User info retrieved:');
      console.log('- ID:', userResponse.data.id);
      console.log('- Name:', userResponse.data.name);
      console.log('- Roles:', userResponse.data.roles);
      console.log('- Capabilities:', Object.keys(userResponse.data.capabilities || {}).filter(cap => userResponse.data.capabilities[cap]));
    } catch (err) {
      console.log('❌ Cannot retrieve user info (might be restricted by the site)');
    }
    console.log('');
    
    // Test 3: Check if we can get post types
    console.log('3️⃣ Checking post types access...');
    try {
      const typesResponse = await axios.get(`${apiUrl}/types/post`, {
        auth: {
          username: config.username,
          password: config.password
        }
      });
      console.log('✅ Can access post type info');
      console.log('- Post type:', typesResponse.data.slug);
      console.log('- REST base:', typesResponse.data.rest_base);
    } catch (err) {
      console.log('❌ Cannot access post types');
    }
    console.log('');
    
    // Test 4: Try to create a minimal post
    console.log('4️⃣ Testing post creation with minimal data...');
    try {
      const createResponse = await axios.post(`${apiUrl}/posts`, {
        title: 'Test Permission Check',
        content: 'Testing permissions',
        status: 'draft'
      }, {
        auth: {
          username: config.username,
          password: config.password
        }
      });
      console.log('✅ Can create posts! Post ID:', createResponse.data.id);
      
      // Delete the test post
      try {
        await axios.delete(`${apiUrl}/posts/${createResponse.data.id}`, {
          auth: {
            username: config.username,
            password: config.password
          }
        });
        console.log('✅ Test post deleted');
      } catch (err) {
        console.log('⚠️  Could not delete test post');
      }
    } catch (err) {
      console.log('❌ Cannot create posts');
      if (err.response) {
        console.log('Error:', err.response.data.message || err.response.statusText);
      }
    }
    
  } catch (error) {
    console.error('❌ Error during permission check:', error.message);
  }
};

checkUserPermissions(); 