-- Migration: Expand software column to support more platform names
-- Created: 2026-05-29
-- Description: Increase software varchar from 32 to 64 to accommodate longer platform names

ALTER TABLE projects ALTER COLUMN software TYPE varchar(64);
