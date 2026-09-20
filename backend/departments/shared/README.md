# Shared Department Registry

This layer creates a single registry for the four core business domains.

## Purpose
- centralize department lookup
- expose consistent department metadata
- make future service orchestration easy without breaking legacy modules

## Registered Departments
- billing
- analytics
- product-list
- contacts

## Rule
The registry is read-only metadata. It does not replace or duplicate the database or the legacy route handlers.
