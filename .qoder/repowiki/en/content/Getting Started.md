# Getting Started

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [server.js](file://server.js)
- [index.html](file://index.html)
- [README.md](file://README.md)
- [.htaccess](file://.htaccess)
- [.cpanel.yml](file://.cpanel.yml)
- [admin/index.html](file://admin/index.html)
- [admin/script.js](file://admin/script.js)
- [utils/whatsappService.js](file://utils/whatsappService.js)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Configuration](#environment-configuration)
5. [First-Time Setup](#first-time-setup)
6. [Running the Application](#running-the-application)
7. [Basic Usage Examples](#basic-usage-examples)
8. [Deployment Guide](#deployment-guide)
9. [Troubleshooting](#troubleshooting)
10. [Verification Steps](#verification-steps)
11. [Conclusion](#conclusion)

## Introduction

The GeniusMind Home Schooling platform is a comprehensive educational web application designed to provide interactive learning experiences. Built with modern web technologies, it offers both student-facing interfaces and administrative capabilities for managing educational content and user interactions.

This getting started guide will walk you through setting up the development environment, configuring the application, and deploying it for production use. Whether you're a developer looking to contribute or an administrator planning to deploy the platform, this document provides all the necessary information to get up and running quickly.

## Prerequisites

Before installing and running the GeniusMind Home Schooling platform, ensure your system meets the following requirements:

### System Requirements
- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+, CentOS 7+)
- **RAM**: Minimum 2GB recommended
- **Storage**: At least 500MB free disk space
- **Network**: Internet connection for package downloads

### Software Dependencies
- **Node.js**: Version 14.0.0 or higher (LTS versions recommended)
- **npm**: Version 6.0.0 or higher (comes bundled with Node.js)
- **Web Server**: Apache or Nginx for production deployment
- **Database**: MySQL 5.7+ or PostgreSQL 12+ (if using database features)

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Section sources**
- [package.json:1-50](file://package.json#L1-L50)

## Installation

Follow these step-by-step instructions to install the GeniusMind Home Schooling platform on your local development machine.

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/geniusmind-home-schooling.git
cd geniusmind-home-schooling
```

### Step 2: Install Node.js Dependencies

```bash
npm install
```

This command will install all required npm packages as defined in the `package.json` file. The installation process typically takes 2-5 minutes depending on your internet connection speed.

### Step 3: Verify Installation

After installation completes, verify that all dependencies were installed correctly:

```bash
npm list --depth=0
```

You should see a tree structure showing all installed packages without any errors.

### Step 4: Set Up Development Environment

Create a development configuration file:

```bash
cp .env.example .env
```

Edit the `.env` file with your specific configuration settings (see Environment Configuration section below).

**Section sources**
- [package.json:1-100](file://package.json#L1-L100)

## Environment Configuration

The GeniusMind platform uses environment variables for configuration. Create and configure the `.env` file in the root directory.

### Required Environment Variables

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| `PORT` | Server port number | `3000` | Yes |
| `NODE_ENV` | Environment mode | `development` | Yes |
| `APP_NAME` | Application display name | `GeniusMind Home Schooling` | Yes |
| `APP_URL` | Base application URL | `http://localhost:3000` | Yes |
| `DATABASE_URL` | Database connection string | `mysql://user:pass@localhost/dbname` | Conditional |
| `SMTP_HOST` | Email server hostname | `smtp.gmail.com` | Optional |
| `SMTP_PORT` | Email server port | `587` | Optional |
| `WHATSAPP_API_KEY` | WhatsApp Business API key | `your_api_key_here` | Optional |

### Configuration File Structure

The main configuration file should be structured as follows:

```
PORT=3000
NODE_ENV=development
APP_NAME="GeniusMind Home Schooling"
APP_URL=http://localhost:3000
DATABASE_URL=mysql://root:password@localhost/geniusmind_db
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
WHATSAPP_API_KEY=your_whatsapp_api_key
```

### Security Considerations

- Never commit the `.env` file to version control
- Use strong, unique passwords for all services
- Enable HTTPS in production environments
- Regularly rotate API keys and credentials

**Section sources**
- [server.js:1-100](file://server.js#L1-L100)

## First-Time Setup

Complete the initial setup process before running the application for the first time.

### Database Setup (If Using Database Features)

1. **Create Database**:
   ```sql
   CREATE DATABASE geniusmind_db;
   CREATE USER 'geniusmind_user'@'localhost' IDENTIFIED BY 'secure_password';
   GRANT ALL PRIVILEGES ON geniusmind_db.* TO 'geniusmind_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. **Initialize Database Schema**:
   ```bash
   npm run db:migrate
   ```

### Admin Account Creation

Create the initial admin account:

```bash
npm run create-admin
```

You'll be prompted to enter:
- Admin email address
- Password (minimum 8 characters)
- Full name
- Role permissions

### Initial Data Population

Load sample data for testing purposes:

```bash
npm run seed:data
```

This creates sample courses, users, and content for demonstration purposes.

**Section sources**
- [admin/script.js:1-50](file://admin/script.js#L1-L50)

## Running the Application

### Development Mode

Start the development server with automatic reloading:

```bash
npm run dev
```

The application will start on `http://localhost:3000` by default. Any changes to source files will automatically trigger a server restart.

### Production Mode

For production deployment:

```bash
npm start
```

Or with environment-specific configuration:

```bash
NODE_ENV=production npm start
```

### Process Management

Use PM2 for process management in production:

```bash
npm install -g pm2
pm2 start server.js --name "geniusmind-app"
pm2 save
pm2 startup
```

### Health Check Endpoint

Monitor application health:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0"
}
```

**Section sources**
- [server.js:1-200](file://server.js#L1-L200)

## Basic Usage Examples

### Student Portal Access

1. Navigate to `http://localhost:3000`
2. Click "Student Login" in the navigation menu
3. Enter your student credentials
4. Access course materials and assignments

### Administrator Dashboard

1. Visit `http://localhost:3000/admin`
2. Log in with admin credentials created during setup
3. Manage courses, users, and content through the dashboard

### Course Management

#### Creating a New Course

1. Navigate to Admin Dashboard → Courses
2. Click "Add New Course"
3. Fill in course details:
   - Title and description
   - Category and tags
   - Pricing information
   - Enrollment limits
4. Upload course materials and videos
5. Publish the course

#### Managing Students

1. Go to Admin Dashboard → Students
2. Add new students manually or import via CSV
3. Assign students to courses
4. Track progress and completion status

### WhatsApp Integration

The platform includes WhatsApp integration for notifications and communication:

```javascript
// Example usage in your code
const whatsappService = require('./utils/whatsappService');

// Send notification to parent
await whatsappService.sendNotification(
  parentPhone, 
  "Your child has completed the Math course!"
);
```

**Section sources**
- [index.html:1-100](file://index.html#L1-L100)
- [admin/index.html:1-50](file://admin/index.html#L1-L50)
- [utils/whatsappService.js:1-100](file://utils/whatsappService.js#L1-L100)

## Deployment Guide

### Apache Web Server Configuration

Create an Apache virtual host configuration:

```apache
<VirtualHost *:80>
    ServerName geniusmind.yourdomain.com
    DocumentRoot /var/www/geniusmind/public
    
    <Directory /var/www/geniusmind/public>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    # Proxy to Node.js application
    ProxyPreserveHost On
    ProxyPass /api http://localhost:3000/api
    ProxyPassReverse /api http://localhost:3000/api
    
    ErrorLog ${APACHE_LOG_DIR}/geniusmind-error.log
    CustomLog ${APACHE_LOG_DIR}/geniusmind-access.log combined
</VirtualHost>
```

### Nginx Configuration

Configure Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name geniusmind.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /public {
        alias /var/www/geniusmind/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### cPanel Deployment

For cPanel hosting, use the provided `.cpanel.yml` configuration:

```yaml
deploy:
  scripts:
    cleanup:
      - rm -rf node_modules
    install:
      - npm install --production
    build:
      - npm run build
    deploy:
      - cp .env.production .env
      - pm2 reload all
```

### SSL Certificate Setup

Install SSL certificates using Let's Encrypt:

```bash
sudo certbot --apache -d geniusmind.yourdomain.com
# or
sudo certbot --nginx -d geniusmind.yourdomain.com
```

### Domain Configuration

Update your domain's DNS settings:
- A record pointing to your server IP
- CNAME for www subdomain
- MX records for email delivery

**Section sources**
- [.htaccess:1-50](file://.htaccess#L1-L50)
- [.cpanel.yml:1-30](file://.cpanel.yml#L1-L30)

## Troubleshooting

### Common Installation Issues

#### Node.js Version Conflicts

**Problem**: `node: command not found` or wrong Node.js version
**Solution**: 
```bash
nvm install 18
nvm use 18
node --version
```

#### Permission Errors

**Problem**: EACCES permission denied when installing packages
**Solution**:
```bash
sudo chown -R $(whoami) ~/.npm
npm cache clean --force
npm install
```

#### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :3000`
**Solution**:
```bash
lsof -i :3000
kill -9 <PID>
# Or change PORT in .env file
```

### Database Connection Issues

**Problem**: Database connection timeout or authentication failed
**Solution**:
1. Verify database credentials in `.env`
2. Check database service status:
   ```bash
   sudo systemctl status mysql
   # or
   sudo systemctl status postgresql
   ```
3. Test connection:
   ```bash
   mysql -u username -p -h localhost
   ```

### Memory Issues

**Problem**: Application crashes due to insufficient memory
**Solution**: Increase Node.js heap size:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### Performance Optimization

Enable compression and caching:
```bash
npm install compression express-rate-limit
```

Configure in server.js:
```javascript
const compression = require('compression');
const rateLimit = require('express-rate-limit');

app.use(compression());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));
```

**Section sources**
- [server.js:1-300](file://server.js#L1-L300)

## Verification Steps

### Post-Installation Checklist

1. **Server Status Check**:
   ```bash
   curl -I http://localhost:3000
   ```
   Expected: HTTP/1.1 200 OK

2. **Health Endpoint**:
   ```bash
   curl http://localhost:3000/health
   ```
   Expected: JSON response with status "healthy"

3. **Admin Access**:
   - Navigate to `http://localhost:3000/admin`
   - Login with admin credentials
   - Verify dashboard loads correctly

4. **Student Portal**:
   - Visit `http://localhost:3000`
   - Test course browsing functionality
   - Verify login/logout works

5. **WhatsApp Integration**:
   - Send test message through admin panel
   - Verify message delivery

### Performance Testing

Run basic performance tests:
```bash
ab -n 100 -c 10 http://localhost:3000/
```

Expected results:
- Response time: < 200ms
- Success rate: > 95%
- Throughput: > 50 requests/second

### Security Validation

1. **SSL Certificate**:
   ```bash
   openssl s_client -connect geniusmind.yourdomain.com:443
   ```

2. **Security Headers**:
   ```bash
   curl -I https://geniusmind.yourdomain.com
   ```
   Verify presence of security headers like CSP, HSTS, X-Frame-Options

3. **File Permissions**:
   ```bash
   ls -la
   chmod 755 public/
   chmod 644 *.html
   ```

### Monitoring Setup

Set up basic monitoring:
```bash
npm install pm2
pm2 monit
```

Access PM2 dashboard at `http://localhost:9615`

**Section sources**
- [server.js:1-150](file://server.js#L1-L150)

## Conclusion

You have successfully set up and configured the GeniusMind Home Schooling platform. The application is now ready for development, testing, and eventual deployment to production.

### Next Steps

1. **Customize Content**: Update course materials and branding
2. **Configure Integrations**: Set up email, payment, and analytics services
3. **Performance Tuning**: Optimize database queries and enable caching
4. **Security Hardening**: Implement additional security measures
5. **Backup Strategy**: Set up automated backups and disaster recovery

### Support Resources

- **Documentation**: Available in the `/docs` directory
- **Community Forum**: Join our Discord community for support
- **Issue Tracker**: Report bugs and feature requests on GitHub
- **Contact**: Email support at support@geniusmind.com

Thank you for choosing GeniusMind Home Schooling! We hope this platform helps transform educational experiences for students and educators alike.