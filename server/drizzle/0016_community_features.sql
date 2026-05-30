-- Migration: Add community features tables (likes, views, fork tracking)
-- Created: 2026-05-30

-- Add forked_from column to projects
ALTER TABLE projects ADD COLUMN forked_from uuid REFERENCES projects(id) ON DELETE SET NULL;

-- Create project_likes table
CREATE TABLE project_likes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_project_likes_project_id ON project_likes(project_id);

-- Create project_views table
CREATE TABLE project_views (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX idx_project_views_project_id ON project_views(project_id);
