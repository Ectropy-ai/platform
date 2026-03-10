-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document embeddings for semantic search
CREATE TABLE IF NOT EXISTS document_embeddings (
  id SERIAL PRIMARY KEY,
  document_id VARCHAR(255) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimized index for vector similarity search
CREATE INDEX idx_embeddings_vector ON document_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Document analysis results
CREATE TABLE IF NOT EXISTS document_analyses (
  id SERIAL PRIMARY KEY,
  document_path TEXT NOT NULL,
  analysis_type VARCHAR(50),
  results JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Code generation templates
CREATE TABLE IF NOT EXISTS code_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(100),
  template TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial templates
INSERT INTO code_templates (name, category, template) VALUES 
('revit-plugin', 'revit', 'public class RevitPlugin : IExternalCommand { ... }'),
('autocad-script', 'autocad', '(defun c:CustomCommand () ...)'),
('ifc-parser', 'ifc', 'class IFCProcessor { parse(file) { ... } }')
ON CONFLICT (name) DO NOTHING;
