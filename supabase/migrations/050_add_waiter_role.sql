-- Migration to add waiter role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'staff_role' AND e.enumlabel = 'waiter') THEN
        ALTER TYPE staff_role ADD VALUE 'waiter';
    END IF;
END $$;
