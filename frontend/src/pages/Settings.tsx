import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { authApi } from '../lib/api'
import { User, Save } from 'lucide-react'

export default function Settings() {
  const { user, fetchMe } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await authApi.updateProfile({ name })
      setMessage('Profile updated')
      fetchMe()
    } catch {
      setMessage('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      setMessage('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword })
      setMessage('Password changed')
      setCurrentPassword('')
      setNewPassword('')
    } catch {
      setMessage('Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-[#8b8ba8]">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <form onSubmit={handleProfileSave} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white font-semibold">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{user?.name}</div>
            <div className="text-xs text-[#8b8ba8]">{user?.email}</div>
          </div>
        </div>

        <div>
          <label className="block text-sm text-[#8b8ba8] mb-2">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>

      {/* Password */}
      <form onSubmit={handlePasswordSave} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Change password</h3>
        <div>
          <label className="block text-sm text-[#8b8ba8] mb-2">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm text-[#8b8ba8] mb-2">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Save size={14} />
          {saving ? 'Updating...' : 'Update password'}
        </button>
      </form>

      {message && (
        <div className="text-sm text-[#8b8ba8] bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3">
          {message}
        </div>
      )}

      {/* Plan info */}
      <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Current plan</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-[#8b8ba8] capitalize">{user?.plan || 'Free'} tier</div>
            <div className="text-xs text-[#8b8ba8]">{user?.credits || 0} credits remaining</div>
          </div>
          <button className="text-sm text-violet-400 hover:text-violet-300">Upgrade plan</button>
        </div>
      </div>
    </div>
  )
}
