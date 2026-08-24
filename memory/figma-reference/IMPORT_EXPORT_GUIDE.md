# Import/Export Guide

## Overview
The Fleet Management System now supports comprehensive import/export functionality for vehicles, drivers, and checklists.

## Features

### 1. Export Data

#### Vehicle List Export
- **Location**: Vehicle Dashboard page
- **Format**: CSV file
- **Filename**: `vehicles_YYYY-MM-DD.csv`
- **Includes**:
  - Vehicle ID
  - Make, Model, Year
  - Mileage, Status
  - Driver Assignment
  - Maintenance Dates
  - Cost Information

#### Driver List Export
- **Location**: Add Driver/Vehicle page
- **Format**: CSV file
- **Filename**: `drivers_YYYY-MM-DD.csv`
- **Includes**:
  - Driver ID
  - Name, Email, Phone
  - License Information
  - Hire Date, Status
  - Department
  - Emergency Contact

#### Vehicle Checklists Export
- **Location**: Vehicle Checklists page
- **Format**: CSV file
- **Filename**: `vehicle_checklists_YYYY-MM-DD.csv`
- **Includes**:
  - All inspection details
  - Location and GPS coordinates
  - Pass/Fail status for each item
  - Defect information

### 2. Import Data

#### Vehicle Import
1. Click "Import/Export" button on Vehicle Dashboard
2. Select "Download Vehicle Template" to get the correct format
3. Fill in the template with your vehicle data
4. Select "Import Vehicles (CSV)"
5. Upload your completed CSV file
6. Review the preview
7. Click "Import" to add vehicles

#### Driver Import
1. Click "Import/Export" button on Add Driver/Vehicle page
2. Select "Download Driver Template" to get the correct format
3. Fill in the template with your driver data
4. Select "Import Drivers (CSV)"
5. Upload your completed CSV file
6. Review the preview
7. Click "Import" to add drivers

## CSV Templates

### Vehicle Template Fields (Required)
- **Vehicle ID**: Unique identifier (e.g., TRK-1001)
- **Make**: Vehicle manufacturer (e.g., Ford)
- **Model**: Vehicle model (e.g., Transit)
- **Year**: Manufacturing year (e.g., 2022)
- **Mileage**: Current mileage (e.g., 50000)
- **Status**: Active, Maintenance, or Out of Service
- **Driver**: Driver name (e.g., John Smith)
- **Last Maintenance**: Date in YYYY-MM-DD format
- **Next Maintenance**: Date in YYYY-MM-DD format
- **Total Cost**: Total maintenance cost (e.g., 8500)
- **Monthly Cost**: Monthly maintenance cost (e.g., 1700)

### Driver Template Fields (Required)
- **Driver ID**: Unique identifier (e.g., DRV-1001)
- **First Name**: Driver's first name
- **Last Name**: Driver's last name
- **Email**: Email address
- **Phone**: Phone number (e.g., 555-0101)
- **License Number**: Driver's license number
- **License Expiry**: Date in YYYY-MM-DD format
- **Date Hired**: Date in YYYY-MM-DD format
- **Status**: Active or Inactive
- **Department**: Department name (e.g., Logistics)
- **Emergency Contact Name**: Name of emergency contact
- **Emergency Contact Phone**: Emergency contact phone

## Tips

1. **Always download the template first** - This ensures you have the correct format
2. **Use the examples** - The templates include sample data showing the correct format
3. **Check your dates** - Use YYYY-MM-DD format (e.g., 2026-05-15)
4. **Preview before importing** - Review the data preview to catch any errors
5. **CSV format** - Excel can save as CSV, or use any text editor
6. **Backup first** - Export your current data before importing new records

## Troubleshooting

### Import Errors
- **"Missing required fields"**: Make sure all column headers match the template exactly
- **"File is empty or invalid"**: Check that the file is a valid CSV format
- **Wrong format**: Download the template again and copy your data into it

### Export Issues
- **No data exported**: Make sure there are records to export
- **File not downloading**: Check your browser's download settings

## Integration Notes

- Imported vehicles are added to the existing fleet
- Imported drivers are registered in the system
- Export files include timestamps for version tracking
- All operations provide success/error notifications
