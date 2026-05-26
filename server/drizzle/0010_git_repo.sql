-- Add Git repository tracking to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_branch VARCHAR(255);
