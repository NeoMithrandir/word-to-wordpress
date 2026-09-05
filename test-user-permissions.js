/**
 * Test WordPress user permissions. Uses the same request pattern as the working curl:
 *   curl -X POST https://SITE/wp-json/wp/v2/posts -u "USER:APP_PASSWORD" \
 *     -H "Content-Type: application/json" -d '{"title":"Test Post","status":"draft"}'
 *
 * Edit config below (same credentials as your working curl), then run:
 *   node test-user-permissions.js
 */

const axios = require('axios');

const config = {
  siteUrl: 'https://inscience.gr/',
  username: 'nesimk',
  password: 'AuTF FQcG tBld UZuA UdMp mcvH'  // same as in curl -u "user:pass"
};

const apiUrl = () => `${config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;

const authHeaders = () => ({
  auth: { username: config.username, password: config.password },
  headers: { 'Content-Type': 'application/json' }
});

const checkUserPermissions = async () => {
  const base = apiUrl();

  console.log('🔍 Checking user permissions for:', config.username);
  console.log('Site:', config.siteUrl);
  console.log('');

  try {
    // Test 1: GET posts (basic auth)
    console.log('1️⃣ Testing basic authentication (GET /posts)...');
    await axios.get(`${base}/posts`, {
      ...authHeaders(),
      params: { per_page: 1 }
    });
    console.log('✅ Authentication works');
    console.log('');

    // Test 2: User info
    console.log('2️⃣ Getting user information (GET /users/me)...');
    try {
      const userResponse = await axios.get(`${base}/users/me`, authHeaders());
      console.log('✅ User info:', userResponse.data.id, userResponse.data.name, userResponse.data.roles);
    } catch (err) {
      console.log('❌ Cannot retrieve user info (may be restricted by site)');
    }
    console.log('');

    // Test 3: Post type
    console.log('3️⃣ Checking post type (GET /types/post)...');
    try {
      const typesResponse = await axios.get(`${base}/types/post`, authHeaders());
      console.log('✅ Post type:', typesResponse.data.slug);
    } catch (err) {
      console.log('❌ Cannot access post types');
    }
    console.log('');

    // Test 4: Create post – same as working curl (POST with title + status only)
    console.log('4️⃣ Testing post creation (POST /posts, same as working curl)...');
    try {
      const createResponse = await axios.post(
        `${base}/posts`,
        { title: 'Test Post', status: 'draft' },
        authHeaders()
      );
      console.log('✅ Can create posts! Post ID:', createResponse.data.id);

      try {
        await axios.delete(`${base}/posts/${createResponse.data.id}`, authHeaders());
        console.log('✅ Test post deleted');
      } catch (err) {
        console.log('⚠️  Could not delete test post');
      }
    } catch (err) {
      console.log('❌ Cannot create posts');
      if (err.response?.data?.message) console.log('   ', err.response.data.message);
    }
  } catch (error) {
    console.error('❌ Error during permission check:', error.message);
  }
};

checkUserPermissions();
