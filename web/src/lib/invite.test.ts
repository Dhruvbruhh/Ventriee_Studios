import { expect, test } from 'vitest'
import { validInviteEmail, validInviteRole, validOrgId } from './invite'

// Pins the rules the invite-member Edge Function enforces server-side
// (supabase/functions/invite-member applies the same checks).

test('invite email validation', () => {
  expect(validInviteEmail('name@studio.com')).toBe(true)
  expect(validInviteEmail('  name@studio.com ')).toBe(true)
  expect(validInviteEmail('name+tag@sub.studio.co')).toBe(true)
  expect(validInviteEmail('nope')).toBe(false)
  expect(validInviteEmail('name@')).toBe(false)
  expect(validInviteEmail('@studio.com')).toBe(false)
  expect(validInviteEmail('')).toBe(false)
  expect(validInviteEmail(42)).toBe(false)
  expect(validInviteEmail(null)).toBe(false)
  expect(validInviteEmail(`a${'x'.repeat(320)}@studio.com`)).toBe(false)
})

test('invite role validation only allows assignable roles', () => {
  expect(validInviteRole('employee')).toBe(true)
  expect(validInviteRole('project_manager')).toBe(true)
  expect(validInviteRole('admin')).toBe(true)
  expect(validInviteRole('owner')).toBe(false)
  expect(validInviteRole('superadmin')).toBe(false)
  expect(validInviteRole('')).toBe(false)
  expect(validInviteRole(undefined)).toBe(false)
})

test('org id must be a uuid', () => {
  expect(validOrgId('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
  expect(validOrgId('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
  expect(validOrgId('not-a-uuid')).toBe(false)
  expect(validOrgId('123e4567e89b12d3a456426614174000')).toBe(false)
  expect(validOrgId(undefined)).toBe(false)
})
