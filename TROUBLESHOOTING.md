# Troubleshooting WordPress Posting (incl. Bitnami Lightsail)

## "User doesn't have permission to post" but the same user can post in WP Admin

This usually means the **REST API is not receiving your credentials**, so WordPress treats the request as anonymous and returns 401 / "not allowed to create posts". Your user is fine; the server is dropping the auth header.

---

## Check whether headers contain what’s needed

### 1. Confirm the client sends the Authorization header

The app (and the test scripts) use **HTTP Basic Auth**: they send a header:

`Authorization: Basic <base64(username:application_password)>`

**Option A – Node script (recommended)**  
Edit the config at the top of `check-wp-auth-headers.js` (same `siteUrl`, `username`, Application Password as in the app), then run:

```bash
node check-wp-auth-headers.js
```

- It prints whether an **Authorization** header is being sent (value redacted).
- It then calls `GET /wp-json/wp/v2/users/me`. If that returns **200**, the server received the header and authenticated you. If it returns **401**, the server is not seeing the header (or credentials are wrong).

**Option B – curl**

On **Linux / macOS / Git Bash** (do not use `/dev/null` on Windows – it can hang):

```bash
curl -s -o /dev/null -w "%{http_code}" -u "USERNAME:APPLICATION_PASSWORD" "https://YOUR-SITE.com/wp-json/wp/v2/users/me"
```

On **Windows (cmd)** use `NUL` instead of `/dev/null`:

```cmd
curl -s -o NUL -w "%{http_code}" -u "USERNAME:APPLICATION_PASSWORD" "https://YOUR-SITE.com/wp-json/wp/v2/users/me"
```

- Replace `USERNAME`, `APPLICATION_PASSWORD`, and `YOUR-SITE.com`. Use the Application Password **with spaces**.
- **200** = server received auth. **401** = server did not (or wrong credentials).
- If your password has spaces or special characters, quoting can be tricky in the shell; prefer **Option A** (`node check-wp-auth-headers.js`) in that case.

### 2. Confirm the server receives the header (optional)

If the client clearly sends the header but you still get 401, the server is stripping it. To confirm on the WordPress server, temporarily expose whether PHP sees the header.

**Temporary PHP check (remove after debugging):**

Create a file in your WordPress root (same folder as `wp-config.php`), e.g. `check-auth-header.php`:

```php
<?php
// Temporary: check if Apache passed the Authorization header to PHP. DELETE after use.
header('Content-Type: application/json');
$auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] : null);
echo json_encode([
  'HTTP_AUTHORIZATION_set' => !empty($auth),
  'REDIRECT_HTTP_AUTHORIZATION_set' => !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null),
]);
```

Then open in a browser (or with curl **with** `-u user:app_password`):

`https://YOUR-SITE.com/check-auth-header.php`

- If the response shows `HTTP_AUTHORIZATION_set: true`, the header is reaching PHP and the problem is elsewhere (e.g. wrong password).
- If it shows `false`, Apache is not passing the header; use the fix in the next section, then **delete** `check-auth-header.php`.

---

## Fix: Apache passing the Authorization header

On many Apache setups (including Bitnami WordPress on Lightsail), the **Authorization** header is removed before the request reaches PHP, so the REST API never sees your Application Password.

**Add this directive** (in the right place for your setup – see Bitnami section below):

```apache
<IfModule mod_setenvif>
  SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
</IfModule>
```

Then restart Apache.

- [WordPress REST API FAQ – Why is Authentication not working?](https://developer.wordpress.org/rest-api/frequently-asked-questions/#why-is-authentication-not-working)

---

## If SetEnvIf didn’t work (PHP-FPM / FastCGI)

Bitnami often runs PHP via **PHP-FPM** (FastCGI). In that setup, Apache may not pass environment variables from the `<Directory>` block to the PHP-FPM process, so `SetEnvIf` alone can have no effect. Try one of these.

### Option 1: CGIPassAuth on (try this first)

This tells Apache to pass the `Authorization` header through to the backend (PHP-FPM). **Do not** put `CGIPassAuth` inside `<VirtualHost>` — Apache does not allow it there and will fail to start.

In the **same vhost file** (e.g. `wordpress-https-vhost.conf`), add this line **only inside** the `<Directory "/opt/bitnami/wordpress">` block (e.g. next to your existing `SetEnvIf` block):

```apache
CGIPassAuth on
```

Example — inside the Directory block you already have:
```apache
<Directory "/opt/bitnami/wordpress">
  Options ...
  AllowOverride None
  Require all granted
  <IfModule mod_setenvif>
    SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
  </IfModule>
  CGIPassAuth on
</Directory>
```

Restart Apache and test again.

### Option 2: RewriteRule in the htaccess conf

If `CGIPassAuth on` doesn’t help, set the header via the rewrite phase so it’s in the request when WordPress runs. Edit the **included** htaccess conf (e.g. `/opt/bitnami/apache/conf/vhosts/htaccess/wordpress-htaccess.conf`). Find the block that has `RewriteEngine On` (often inside `<Directory "/opt/bitnami/wordpress">`). Right after `RewriteEngine On`, add:

```apache
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
```

So it looks like:

```apache
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
# ... rest of existing rules (RewriteBase, RewriteRule ^index\.php$, etc.)
```

WordPress reads both `HTTP_AUTHORIZATION` and `REDIRECT_HTTP_AUTHORIZATION`; this rule can set either depending on the request. Save, restart Apache, and test again.

---

## Bitnami (Lightsail): Is .htaccess used? Where to put the fix?

On Bitnami, Apache often **does not use .htaccess** by default. So adding the `SetEnvIf` block only to `.htaccess` may have no effect. You need to either enable .htaccess or put the directive in the Apache config.

### Step 1: Check if .htaccess is being read

1. **SSH into your Bitnami Lightsail instance.**

2. **Find the virtual host that serves your site.**  
   The WordPress `<Directory>` block may be in the main Bitnami config **or** in a separate vhost file that is included.
   - Main configs: `/opt/bitnami/apache/conf/bitnami/bitnami-ssl.conf` (HTTPS), `/opt/bitnami/apache/conf/bitnami/bitnami.conf` (HTTP).
   - Included vhosts: `/opt/bitnami/apache/conf/vhosts/`. List them:
     ```bash
     ls -la /opt/bitnami/apache/conf/vhosts/
     ```
     Look for files like `wordpress-vhost.conf`, `wordpress-https-vhost.conf`, or similar. The main configs often `Include` one of these.

3. **Find the `<Directory>` block** that applies to your WordPress root. Open the vhost that serves your site (see Step 2). Search for `DocumentRoot` or `<Directory` to get the actual path (e.g. `/opt/bitnami/wordpress` or something like `/opt/bitnami/apps/wordpress/htdocs`). In that `<Directory>` block, find:
   ```apache
   AllowOverride None
   ```
   or
   ```apache
   AllowOverride All
   ```

4. **Interpret:**
   - **`AllowOverride None`** → Apache **ignores** `.htaccess` in that directory. Any rules you put in WordPress `.htaccess` (e.g. under `/opt/bitnami/wordpress/.htaccess`) will **not** run. You must add the Authorization fix in a `.conf` file (Step 2B or 2C).
   - **`AllowOverride All`** → Apache **does** read `.htaccess`. You can add the `SetEnvIf` block to WordPress `.htaccess` (same folder as `wp-config.php`), or still use the .conf method if you prefer.

5. **Optional: confirm there is an .htaccess file** (use the path you found for your WordPress root):
   ```bash
   ls -la /path/to/wordpress/.htaccess
   ```
   If it exists and `AllowOverride` is `None`, that file is still being ignored.

### Step 2: Add the Authorization fix in the right place

Use **one** of these.

**Option A – Use .htaccess only if it’s enabled**  
If Step 1 showed `AllowOverride All` for your WordPress directory:

1. Edit the WordPress `.htaccess` (same directory as `wp-config.php`), e.g.:
   ```bash
   sudo nano /opt/bitnami/wordpress/.htaccess
   ```
2. Add **at the top** (before any `# BEGIN WordPress` block):
   ```apache
   <IfModule mod_setenvif>
     SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
   </IfModule>
   ```
3. Save, then restart Apache (Step 3).

**Option B – Put the fix in the included “htaccess” conf (recommended on Bitnami)**  
Bitnami often keeps rewrite rules in a separate conf file that is included from the vhost. That file is read regardless of `AllowOverride`.

1. **Find the included htaccess conf.** In `bitnami-ssl.conf` or `bitnami.conf` you should see a line like:
   ```apache
   Include "/opt/bitnami/apache/conf/vhosts/htaccess/wordpress-htaccess.conf"
   ```
   The path might be `wordpress-htaccess.conf` or similar (e.g. `wordpress-multisite-htaccess.conf`). List the directory to see the exact name:
   ```bash
   ls /opt/bitnami/apache/conf/vhosts/htaccess/
   ```

2. **Edit that file:**
   ```bash
   sudo nano /opt/bitnami/apache/conf/vhosts/htaccess/wordpress-htaccess.conf
   ```
   Add the block **inside** the existing `<Directory "/opt/bitnami/wordpress">` (or the path that matches your WordPress root), or at the top of the file if it’s a single global block:
   ```apache
   <IfModule mod_setenvif>
     SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
   </IfModule>
   ```
   Save and exit.

**Option C – Put the fix in the vhost that defines your WordPress directory**  
Use this when the WordPress `<Directory>` block is **not** in `bitnami-ssl.conf` / `bitnami.conf` but in a separate vhost file.

1. **Find which vhost file contains the WordPress config.**  
   From the vhosts directory:
   ```bash
   cd /opt/bitnami/apache/conf/vhosts
   grep -l "Directory\|DocumentRoot" *.conf
   ```
   Open the one that serves HTTPS (often named `*-https*.conf` or `*ssl*`), or the main WordPress vhost. You can also check what the main config includes:
   ```bash
   grep -r "Include.*vhosts" /opt/bitnami/apache/conf/bitnami/
   ```
   That shows which vhost files are loaded (e.g. `wordpress-https-vhost.conf`).

2. **Find the WordPress root path in that vhost.**  
   Open the file (e.g. `wordpress-https-vhost.conf`):
   ```bash
   sudo nano /opt/bitnami/apache/conf/vhosts/wordpress-https-vhost.conf
   ```
   Look for `DocumentRoot` (e.g. `DocumentRoot /opt/bitnami/apps/wordpress/htdocs`) and the matching `<Directory "...">` block. The path inside `<Directory "...">` is your WordPress root.

3. **Add exactly these 3 lines** inside the existing `<Directory>` block (before the closing `</Directory>`). Do not remove or change the existing lines (Options, AllowOverride, Require):
   ```apache
   <IfModule mod_setenvif>
     SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
   </IfModule>
   ```
   Example: if your block currently looks like this:
   ```apache
   <Directory "/opt/bitnami/apps/wordpress/htdocs">
     Options -Indexes +FollowSymLinks
     AllowOverride None
     Require all granted
   </Directory>
   ```
   change it to this (only the 3 new lines added):
   ```apache
   <Directory "/opt/bitnami/apps/wordpress/htdocs">
     Options -Indexes +FollowSymLinks
     AllowOverride None
     Require all granted
     <IfModule mod_setenvif>
       SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
     </IfModule>
   </Directory>
   ```
   Use **your** path in `<Directory "…">`, not necessarily `/opt/bitnami/apps/wordpress/htdocs`. Save and exit.

4. **If your WordPress block is in the main Bitnami SSL config instead:**  
   Edit `bitnami-ssl.conf`, search for `<Directory` and apply the same change inside the block that matches your site’s `DocumentRoot`.

### Step 3: Restart Apache

After any config or .htaccess change:

```bash
sudo /opt/bitnami/ctlscript.sh restart apache
```

Or restart the whole stack:

```bash
sudo /opt/bitnami/ctlscript.sh restart
```

### Step 4: Verify

Run again from your machine:

```bash
node check-wp-auth-headers.js
```

You should see **200** for `GET /users/me` and “Server returned 200 – it received the Authorization header”.

---

## Other checks and tips

**HTTPS and Application Password**

- The REST API must be called over **HTTPS** when using Application Passwords.
- Use an **Application Password** (from WP Admin → Users → Profile → Application Passwords), not your normal WordPress login password.
- Copy the Application Password **with spaces** exactly as shown.

**"Sorry, you are not allowed to create posts as this user"**

WordPress did authenticate you, but you're trying to create a post as a different user (e.g. by sending an `author` ID you're not allowed to assign). This app only sends `author` when you explicitly set it; if you see this message, check that you're not passing another user's ID, or use the same WordPress user in the app as in the admin.

**Full permission test**

1. Update `test-user-permissions.js` with your `siteUrl`, `username`, and Application Password (same as in the app config).
2. Run: `node test-user-permissions.js`
3. "✅ Can create posts!" means credentials and server auth are fine. If you still get 401, use the Apache/ Bitnami fix above.

**App server logs**

After a failed publish, the app server logs the full WordPress API error (code, message, status). Use that to tell "not allowed to create posts" (auth not received) from "not allowed to create posts as this user" (auth works, author/assignment issue).
