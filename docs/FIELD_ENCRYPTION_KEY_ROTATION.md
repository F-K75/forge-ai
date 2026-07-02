# Field Encryption Key Rotation

Forge uses `FIELD_ENCRYPTION_KEY` only for encrypted database fields. It must be
generated and stored independently from `JWT_SECRET`.

## Initial migration from the legacy JWT-derived key

1. Back up MongoDB and verify the backup can be restored.
2. Generate the new key with `openssl rand -hex 32` and place it in the secret
   manager as `FIELD_ENCRYPTION_KEY`. Do not deploy the application yet.
3. Export the previous JWT signing secret as `LEGACY_JWT_SECRET` only in the
   isolated migration environment. Never add it to application configuration.
4. Run a preflight:
   `python backend/scripts/migrate_field_encryption.py`
5. Run the migration:
   `python backend/scripts/migrate_field_encryption.py --apply`
6. Repeat the preflight. `eligible=0` confirms no values remain under the old
   key. Deploy all application replicas with `FIELD_ENCRYPTION_KEY` together.
7. Verify profile reads and GitHub deployment authentication, then remove
   `LEGACY_JWT_SECRET` from the migration environment.

The migration uses compare-and-set updates, skips already-migrated values, and
does not overwrite malformed ciphertext. Any skipped malformed value requires
manual recovery from the verified backup.

## Routine rotation

Routine rotation uses the same staged process with a dedicated offline job:
decrypt using the previous field key, re-encrypt with the next field key,
verify, and atomically roll application replicas. Keep the previous key in the
secret manager only for the rollback window. Rotate at least every 90 days and
immediately after suspected exposure.

## Rollback

Stop writes, restore the verified pre-migration database backup, restore the
previous application secret set, and roll back all replicas together. Partial
key rollouts are prohibited because they make encrypted fields unreadable.
