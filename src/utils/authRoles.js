/** Normalized auth role helpers from `authUser.user_type`. */

export const USER_TYPES = {
  MASTER_ADMIN: 'MASTER_ADMIN',
  VSRE_OWNER: 'VSRE_OWNER',
  VSRE_MANAGER: 'VSRE_MANAGER',
  VSRE_STAFF: 'VSRE_STAFF',
  CUSTOMER: 'CUSTOMER',
}

export const getUserType = (userOrType) => {
  if (userOrType == null) return ''
  if (typeof userOrType === 'string') return String(userOrType).trim().toUpperCase()
  return String(userOrType?.user_type || '').trim().toUpperCase()
}

export const isMasterAdmin = (userOrType) => getUserType(userOrType) === USER_TYPES.MASTER_ADMIN

export const isVsreOwner = (userOrType) => getUserType(userOrType) === USER_TYPES.VSRE_OWNER

/** Full dashboard / owner-level privileges: VSRE_OWNER and MASTER_ADMIN. */
export const hasOwnerPrivileges = (userOrType) => {
  const type = getUserType(userOrType)
  return type === USER_TYPES.VSRE_OWNER || type === USER_TYPES.MASTER_ADMIN
}

/** Manage staff access: owner, master admin, or manager. */
export const canManageStaff = (userOrType) => {
  const type = getUserType(userOrType)
  return (
    type === USER_TYPES.VSRE_OWNER ||
    type === USER_TYPES.MASTER_ADMIN ||
    type === USER_TYPES.VSRE_MANAGER
  )
}

/** Internal care portal users (owner, master admin, manager, staff). */
export const isCareStaffUser = (userOrType) => {
  const type = getUserType(userOrType)
  return (
    type === USER_TYPES.VSRE_OWNER ||
    type === USER_TYPES.MASTER_ADMIN ||
    type === USER_TYPES.VSRE_MANAGER ||
    type === USER_TYPES.VSRE_STAFF
  )
}
