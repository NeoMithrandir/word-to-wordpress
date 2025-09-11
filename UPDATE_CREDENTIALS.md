# How to Update WordPress Credentials

## Quick Steps:

1. **Edit the configuration file:**
   Open `client/src/config/wordpress.config.ts`

2. **Update the credentials:**
   ```typescript
   export const WORDPRESS_CONFIG = {
     siteUrl: 'https://your-wordpress-site.com/',
     username: 'your-username',
     password: 'your app password with spaces'
   };
   ```

3. **Test the credentials:**
   ```bash
   node test-user-permissions.js
   ```
   
   This will show if the user can create posts.

## WordPress User Roles:

- **Subscriber**: Cannot create posts ❌
- **Contributor**: Can create but not publish ⚠️
- **Author**: Can create and publish own posts ✅
- **Editor**: Can create, edit, and publish any posts ✅
- **Administrator**: Full access ✅

## Getting an Application Password:

1. Login to WordPress admin
2. Go to **Users** → **Profile**
3. Scroll to **Application Passwords**
4. Enter a name (e.g., "Word Converter")
5. Click **Add New Application Password**
6. Copy the password WITH spaces

## Testing Your Credentials:

Run this command to test if a user can create posts:
```bash
node test-user-permissions.js
```

Look for: "✅ Can create posts!" to confirm it's working. 