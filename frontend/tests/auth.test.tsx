import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignIn from '../src/pages/SignIn'
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), resendConfirmation: vi.fn() }))
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({ ...mocks, configError: '' }) }))
vi.mock('../src/lib/api', () => ({ supabaseConfigured: true }))
vi.mock('../src/experience/AmbientBackdrop', () => ({ AmbientBackdrop: () => null }))
afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())
function fill() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'long-password' } })
}
describe('account creation', () => {
  it('shows confirmation as its own step and prevents immediate resend', async () => {
    mocks.signUp.mockResolvedValue(true)
    render(<SignIn />)
    fireEvent.click(screen.getByText('New here? Create an account'))
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled()
    expect(mocks.signUp).toHaveBeenCalledWith('test@example.com', 'long-password', '')
    expect(mocks.resendConfirmation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('I confirmed my email — sign in'))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
  it('turns server cooldown errors into a disabled countdown and inbox guidance', async () => {
    mocks.signUp.mockRejectedValue(new Error('For security purposes, you can only request this after 42 seconds.'))
    render(<SignIn />)
    fireEvent.click(screen.getByText('New here? Create an account'))
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('check your inbox')
    expect(screen.getByRole('button', { name: 'Try again in 42s' })).toBeDisabled()
  })
  it('offers confirmation recovery when sign-in says the email is unconfirmed', async () => {
    mocks.signIn.mockRejectedValue(Object.assign(new Error('Email not confirmed'), { code: 'email_not_confirmed' }))
    render(<SignIn />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    mocks.resendConfirmation.mockResolvedValue(undefined)
    fireEvent.click(screen.getByText('Resend confirmation email'))
    await waitFor(() => expect(mocks.resendConfirmation).toHaveBeenCalledWith('test@example.com'))
    expect(await screen.findByRole('status')).toHaveTextContent('newest link')
  })
  it('does not impose the signup password length on existing accounts', () => {
    render(<SignIn />)
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('minlength')
    fireEvent.click(screen.getByText('Show password'))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
  })
})
