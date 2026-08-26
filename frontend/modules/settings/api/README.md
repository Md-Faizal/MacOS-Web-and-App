# Settings App

Application configuration and settings management with support for different data types.

## Overview

The Settings App provides a key-value store for application settings supporting both simple strings and complex JSON objects.

## Endpoints

### Get All Settings
```
GET /api/settings
```

Returns all settings as a JSON object where keys are setting keys and values are their values.

### Get Single Setting
```
GET /api/settings/:key
```

Returns a specific setting with its key, value, and type.

### Create or Update Setting
```
POST /api/settings
Content-Type: application/json

{
  "setting_key": "app_theme",
  "setting_value": "dark",
  "setting_type": "string"
}
```

For JSON settings:
```json
{
  "setting_key": "dashboard_config",
  "setting_value": {
    "show_charts": true,
    "chart_type": "bar",
    "refresh_interval": 5000
  },
  "setting_type": "json"
}
```

### Update Setting
```
PUT /api/settings/:key
Content-Type: application/json

{
  "setting_value": "light",
  "setting_type": "string"
}
```

### Delete Setting
```
DELETE /api/settings/:key
```

### Bulk Update Settings
```
POST /api/settings/bulk/update
Content-Type: application/json

{
  "app_theme": "dark",
  "app_language": "en",
  "notifications_enabled": true,
  "dashboard_config": {
    "show_charts": true,
    "widgets": ["revenue", "traffic"]
  }
}
```

## Data Structure

```
id              TEXT PRIMARY KEY
setting_key     TEXT NOT NULL UNIQUE
setting_value   TEXT NOT NULL
setting_type    TEXT DEFAULT 'string'
created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## Setting Types

- **string** - Simple text values
- **json** - Complex JSON objects and arrays

The app automatically detects type based on value structure.

## Example Usage

```javascript
// Create string setting
const stringSettings = {
  setting_key: "app_theme",
  setting_value: "dark",
  setting_type: "string"
};

// POST /api/settings

// Create JSON setting
const jsonSettings = {
  setting_key: "dashboard_layout",
  setting_value: {
    widgets: ["revenue", "users", "traffic"],
    columns: 3,
    visible: true,
    refresh_interval: 5000
  },
  setting_type: "json"
};

// POST /api/settings

// Bulk update multiple settings
const bulkUpdate = {
  "app_theme": "dark",
  "app_language": "en",
  "notifications_enabled": true,
  "email_frequency": "daily",
  "dashboard_config": {
    "show_analytics": true,
    "auto_refresh": true
  }
};

// POST /api/settings/bulk/update

// Get all settings
// GET /api/settings

// Returns:
{
  "app_theme": "dark",
  "app_language": "en",
  "notifications_enabled": true,
  "dashboard_config": {
    "show_analytics": true,
    "auto_refresh": true
  }
}
```

## Common Settings

Recommended application settings:

```json
{
  "app_theme": "dark",
  "app_language": "en",
  "notifications_enabled": true,
  "email_frequency": "daily",
  "timezone": "UTC",
  "date_format": "YYYY-MM-DD",
  "currency": "INR",
  "dashboard_config": {
    "widgets": [],
    "columns": 3
  },
  "email_config": {
    "sender": "app@example.com",
    "smtp_server": "smtp.gmail.com",
    "use_tls": true
  }
}
```

## Features

- Store string and JSON settings
- Automatic type detection
- Get all settings at once
- Get/update individual settings
- Bulk update multiple settings at once
- Delete unused settings
- Automatic timestamps

## Practical Use Cases

1. **Application Configuration** - UI theme, language, timezone
2. **Feature Flags** - Enable/disable features
3. **API Configuration** - API endpoints, timeouts
4. **Email Settings** - SMTP configuration
5. **Dashboard Layout** - Widget configuration
6. **User Preferences** - Per-user settings
7. **Business Rules** - Tax rates, discounts, rules

## Type Conversion

The app automatically converts values:

```javascript
// String input
{ "setting_value": "true" } → type: "string"

// JSON input
{ "setting_value": { "flag": true } } → type: "json"
```

## Integration

All settings are stored in a centralized location accessible across the application. The bulk update feature enables efficient configuration management.
