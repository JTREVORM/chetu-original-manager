INSERT INTO public.profiles (id, email, full_name, role, phone_number, status)
VALUES (
  'b0b1b9a3-5373-4f4c-833c-c39598ab86b6',
  'badhaza@gmail.com',
  'System Administrator',
  'Administrator',
  '0740081305',
  'Active'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  phone_number = EXCLUDED.phone_number,
  status = EXCLUDED.status;