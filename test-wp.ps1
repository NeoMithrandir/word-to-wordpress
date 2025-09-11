# WordPress Connection Test for Windows PowerShell
# Edit the values below with your actual WordPress details

$siteUrl = "https://your-wordpress-site.com"
$username = "your-username"
$appPassword = "AbCd EfGh IjKl MnOp"  # Include spaces exactly as generated

Write-Host "🔍 Testing WordPress Connection..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Basic site access
Write-Host "1️⃣ Testing site accessibility..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $siteUrl -TimeoutSec 10
    Write-Host "✅ Site is accessible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Site not accessible: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Test 2: REST API endpoint
$apiUrl = "$($siteUrl.TrimEnd('/'))/wp-json/wp/v2"
Write-Host ""
Write-Host "2️⃣ Testing REST API: $apiUrl" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $apiUrl -TimeoutSec 10
    Write-Host "✅ WordPress REST API is accessible" -ForegroundColor Green
} catch {
    Write-Host "❌ REST API not accessible: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure WordPress REST API is enabled" -ForegroundColor Blue
    exit
}

# Test 3: Authentication test
Write-Host ""
Write-Host "3️⃣ Testing authentication..." -ForegroundColor Yellow

# Create credentials
$securePassword = ConvertTo-SecureString $appPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ($username, $securePassword)

try {
    $response = Invoke-WebRequest -Uri "$apiUrl/posts?per_page=1" -Credential $credential -TimeoutSec 10
    Write-Host "✅ Authentication successful!" -ForegroundColor Green
    $totalPosts = $response.Headers['X-WP-Total']
    if ($totalPosts) {
        Write-Host "📊 Found $totalPosts total posts" -ForegroundColor Blue
    }
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host ""
        Write-Host "🚨 AUTHENTICATION ERROR - Check these:" -ForegroundColor Red
        Write-Host "• Username is correct (case-sensitive)" -ForegroundColor White
        Write-Host "• Application password includes spaces exactly as generated" -ForegroundColor White
        Write-Host "• Application password is not your regular WordPress password" -ForegroundColor White
        Write-Host "• User has proper permissions (Author/Editor/Admin)" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "🔍 Test completed. If authentication failed, check the points above." -ForegroundColor Cyan 