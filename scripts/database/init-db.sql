-- Simple database initialization for development
-- Create development database with UTF8 encoding
CREATE DATABASE IF NOT EXISTS ectropy_dev WITH ENCODING 'UTF8';

-- Enable PostGIS extension for spatial features (if available)
-- This will silently fail in basic PostgreSQL without PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create basic tables for development
CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial health check entry
INSERT INTO health_check (service_name, status) VALUES ('database', 'healthy') ON CONFLICT DO NOTHING;