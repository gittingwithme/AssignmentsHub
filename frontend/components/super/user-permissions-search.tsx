'use client'

import { useState, useTransition, useCallback, useEffect, useMemo, useRef } from 'react'
import { searchUsers, updateUserRole } from '@/app/super-actions'
import { useToast } from '@/components/ui/shared/toast-provider'

type UserResult = {
  id: string
  full_name: string | null
  role: string
}

export default function UserPermissionsSearch({ currentUserId }: { currentUserId: string }) {
  const [query, setQuery] = useState('')
  const [allUsers, setAllUsers] = useState<UserResult[]>([])
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Load all users once on first interaction
  const ensureLoaded = useCallback(async () => {
    if (loaded) return
    const users = await searchUsers('')
    setAllUsers(users)
    setLoaded(true)
  }, [loaded])

  // Filter locally as user types (derived, no effect needed)
  const filtered = useMemo(() => {
    if (!loaded) return []
    const q = query.trim().toLowerCase()
    if (!q) return allUsers
    return allUsers.filter(
      (u) =>
        (u.full_name?.toLowerCase().includes(q)) ||
        u.id.toLowerCase().includes(q)
    )
  }, [query, allUsers, loaded])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(user: UserResult) {
    setSelectedUser(user)
    setQuery('')
    setDropdownOpen(false)
  }

  function handleRoleChange(newRole: string) {
    if (!selectedUser) return
    const fd = new FormData()
    fd.set('user_id', selectedUser.id)
    fd.set('role', newRole)

    startTransition(async () => {
      try {
        await updateUserRole(fd)
        toast({
          variant: 'success',
          title: 'Role updated',
          description: `${selectedUser.full_name || 'User'} is now ${newRole.replaceAll('_', ' ')}.`,
        })
        // Refresh the user in the cached list
        setSelectedUser({ ...selectedUser, role: newRole })
        setAllUsers((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? { ...u, role: newRole } : u))
        )
      } catch (error) {
        toast({
          variant: 'error',
          title: 'Failed to update role',
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">User permissions</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search or browse users, then assign their role.
        </p>
      </div>

      {/* Combobox / lookup wizard */}
      <div ref={wrapperRef} className="relative z-50">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setDropdownOpen(true)
          }}
          onFocus={async () => {
            await ensureLoaded()
            setDropdownOpen(true)
          }}
          placeholder="Type to filter or click to browse all users…"
          className="premium-input w-full"
        />

        {/* Dropdown chevron */}
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition"
          onClick={async () => {
            await ensureLoaded()
            setDropdownOpen(!dropdownOpen)
          }}
          aria-label="Toggle user list"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Dropdown list */}
        {dropdownOpen && loaded && (
          <div className="absolute z-[100] top-full left-0 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#111214] shadow-2xl">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-zinc-400">No users found</div>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelect(u)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.06] ${
                    selectedUser?.id === u.id ? 'bg-white/[0.04]' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {u.full_name || 'Unnamed user'}
                    </p>
                    <p className="truncate text-xs text-zinc-400">{u.id}</p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                    {u.role}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected user panel */}
      {selectedUser && (
        <div className="mt-4 surface-dark p-4 rounded-2xl">
          <div className="mb-3">
            <p className="font-medium text-white">{selectedUser.full_name || 'Unnamed user'}</p>
            <p className="mt-1 text-xs text-zinc-400">{selectedUser.id}</p>
          </div>

          {selectedUser.id !== currentUserId ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-sm text-zinc-400">Role:</label>
              <select
                value={selectedUser.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={isPending}
                className="premium-select"
              >
                <option value="customer" className="bg-[#111214] text-white">
                  Customer
                </option>
                <option value="admin" className="bg-[#111214] text-white">
                  Admin
                </option>
                <option value="super_admin" className="bg-[#111214] text-white">
                  Super Admin
                </option>
              </select>
              {isPending && (
                <span className="text-xs text-zinc-400">Saving…</span>
              )}
            </div>
          ) : (
            <div className="premium-pill w-fit">{selectedUser.role} (you)</div>
          )}
        </div>
      )}
    </div>
  )
}
