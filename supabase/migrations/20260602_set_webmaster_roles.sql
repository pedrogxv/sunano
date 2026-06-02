-- Ensure exactly the three designated WEB Masters remain as webmaster;
-- all other admin_profiles are demoted to admin.
UPDATE admin_profiles
SET role = CASE
  WHEN id IN (
    'a6b0dcf4-5fbb-4301-b4e4-af3be490fd51',
    'dcf43d3d-debd-46a8-9bb7-c900e3ff25de',
    '408b6c0d-0a81-4e13-97a2-51ad6727baca'
  ) THEN 'webmaster'
  ELSE 'admin'
END
WHERE role != CASE
  WHEN id IN (
    'a6b0dcf4-5fbb-4301-b4e4-af3be490fd51',
    'dcf43d3d-debd-46a8-9bb7-c900e3ff25de',
    '408b6c0d-0a81-4e13-97a2-51ad6727baca'
  ) THEN 'webmaster'
  ELSE 'admin'
END;
