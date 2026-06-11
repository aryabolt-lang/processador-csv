-- Migration: add passwordHash to users table for local email/password auth
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `passwordHash` text;
