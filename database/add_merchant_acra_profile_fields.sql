-- Store merchant-submitted ACRA Business Profile PDF metadata.
-- Run this once before enabling merchant ACRA document review in admin.

ALTER TABLE merchant
ADD COLUMN acra_profile_path VARCHAR(255) NULL AFTER business_uen,
ADD COLUMN acra_profile_original_name VARCHAR(255) NULL AFTER acra_profile_path,
ADD COLUMN acra_profile_uploaded_at DATETIME NULL AFTER acra_profile_original_name;
