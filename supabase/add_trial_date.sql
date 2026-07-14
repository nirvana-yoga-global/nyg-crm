-- Add trial_date column to enquiries table (used when Next Step = "Booked Free Trial")
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS trial_date date;
