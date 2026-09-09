---
title: Better discovery before the demo, in two code snippets
description: I gave a talk to Chili Piper about getting more out of every demo form fill. The idea is simple and the implementation is two small snippets — here they are, with the constraint that shaped them.
date: 2026-09-09
---

I gave a talk to Chili Piper called *Better discovery before the demo*. The pitch was one slide long: your demo form is doing almost no work, and the fix is not a longer form.

The last slide promised two code snippets. This is that slide, expanded.

## The problem

Our old discovery process, honestly described:

1. Prospect fills out the demo form.
2. Prospect picks a time in Chili Piper.
3. It lands on an AE, who knows a name, an email, and nothing about the business.
4. The AE spends the first meeting on basic discovery.

Step four is the expensive part. A booked demo is the most attention a prospect will ever voluntarily give you, and we were spending it asking how many locations they run.

The obvious fix — put those questions on the demo form — is the wrong one. Every field you add to a form buys you data and costs you submissions, and the fields you want most are the ones people abandon over.

## The idea

Keep the form short. Ask *after* the booking.

Chili Piper redirects to `/demo/success` once a time is picked, and that page is a captive audience with nothing to do. So it keeps asking questions, one per screen, and each answer PATCHes straight onto the HubSpot contact as it's given. Nothing is batched and nothing waits for a submit at the end.

Three things fall out of that shape:

- **The prospect has already converted.** Abandoning question four costs you nothing you had before the booking.
- **Every answer is banked immediately.** A partial run still improves the record.
- **Completion becomes a signal.** How far someone got is itself a measure of intent.

## The constraint

All of that depends on `/demo/success` knowing who it's talking to. Ask for the email again and the whole thing collapses — you're a form again.

Chili Piper's redirect deliberately forwards no form data in the URL. Which, annoyingly, is correct: query-string identity gets truncated by link handlers, copied into Slack, logged by analytics, and retained in referrers. I didn't want the visitor's email in a URL either.

So carry it in the browser instead. Two Framer code components, thirty lines of real logic between them.

## 1. Save the email on submit

This one sits inside the demo form. It listens for any form submit in the capture phase — before Framer's own handler completes — pulls the email input's value, and writes it to both `sessionStorage` and `localStorage` with a timestamp.

Storage errors are swallowed on purpose. Private mode and full quotas are real, and neither is a good reason to block a booking.

```tsx
import { useEffect } from "react"

const STORAGE_KEY = "email"
const TS_KEY = "email_ts"

/**
 * Captures the email from any form submit on the page and persists it
 * to sessionStorage + localStorage so downstream forms (e.g. /demo/success)
 * can auto-fill it. Place inside the demo form component so it travels
 * with the form wherever it's embedded.
 */
export default function EmailCapture() {
    useEffect(() => {
        const handler = (e: Event) => {
            const form = e.target as HTMLFormElement
            if (!(form instanceof HTMLFormElement)) return

            const input = form.querySelector<HTMLInputElement>(
                'input[type="email"], input[name="email"], input[name="Email"]'
            )
            const email = input?.value?.trim()
            if (!email) return

            try {
                sessionStorage.setItem(STORAGE_KEY, email)
                localStorage.setItem(STORAGE_KEY, email)
                localStorage.setItem(TS_KEY, Date.now().toString())
            } catch {
                // Storage may be disabled (private mode, quota, etc.) — fail silently
            }
        }

        // Capture phase so we run before Framer's submit handler completes
        document.addEventListener("submit", handler, true)
        return () => document.removeEventListener("submit", handler, true)
    }, [])

    return <div style={{ width: 0, height: 0 }} />
}
```

## 2. Put it back on the confirmation page

This one sits on `/demo/success`. It reads the stored email — `sessionStorage` first, then `localStorage` if it's under thirty minutes old — and fills every email input on the page.

Two details earn their keep here.

**The `MutationObserver`.** Framer hydrates forms asynchronously, so the inputs you want frequently don't exist yet when the effect runs. The observer keeps filling late mounts for thirty seconds, then disconnects rather than watching the DOM forever.

**The native setter.** A plain `input.value = email` does not work. React tracks its own copy of the value and will happily post the empty string it still believes in. Going through the prototype's setter and dispatching bubbled `input` and `change` events is what makes React actually see it.

And on submit it does a last-ditch fill. If there's still no email, it blocks the post and asks — an honest question beats a blank record.

```tsx
import { useEffect } from "react"

const STORAGE_KEY = "email"
const TS_KEY = "email_ts"
const TTL_MS = 30 * 60 * 1000 // 30 minutes

function readStoredEmail(): string | null {
    try {
        const fromSession = sessionStorage.getItem(STORAGE_KEY)
        if (fromSession) return fromSession

        const fromLocal = localStorage.getItem(STORAGE_KEY)
        const ts = Number(localStorage.getItem(TS_KEY) || 0)
        if (fromLocal && Date.now() - ts < TTL_MS) return fromLocal
    } catch {}
    return null
}

/**
 * Sets an input's value in a way React/Framer actually sees.
 * Direct `.value =` doesn't update React's internal state — the native
 * setter + bubbled input event does.
 */
function setReactInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
}

/**
 * Reads the persisted email and fills any email inputs on the page.
 * On submit, blocks blank-email posts as a final safety net.
 * Storage is intentionally not cleared after submit — sessionStorage
 * dies naturally on tab close, and localStorage has a 30-min TTL.
 */
export default function AutoFillEmail() {
    useEffect(() => {
        const email = readStoredEmail()

        const fillInputs = () => {
            const inputs = document.querySelectorAll<HTMLInputElement>(
                'input[type="email"], input[name="email"], input[name="Email"]'
            )
            inputs.forEach((input) => {
                if (!input.value && email) setReactInputValue(input, email)
            })
        }

        if (email) fillInputs()

        // Framer sometimes hydrates the form async — keep watching for late mounts
        const observer = new MutationObserver(() => {
            if (email) fillInputs()
        })
        observer.observe(document.body, { childList: true, subtree: true })
        const observerTimeout = setTimeout(() => observer.disconnect(), 30000)

        const onSubmit = (e: Event) => {
            const form = e.target as HTMLFormElement
            if (!(form instanceof HTMLFormElement)) return

            const input = form.querySelector<HTMLInputElement>(
                'input[type="email"], input[name="email"], input[name="Email"]'
            )
            if (!input) return

            // Last-ditch fill if something stripped the value
            if (!input.value) {
                const retry = readStoredEmail()
                if (retry) {
                    setReactInputValue(input, retry)
                } else {
                    // Block submission — never POST blank
                    e.preventDefault()
                    e.stopPropagation()
                    input.setCustomValidity?.(
                        "Please enter your email to continue"
                    )
                    input.reportValidity?.()
                    return
                }
            }
        }

        document.addEventListener("submit", onSubmit, true)

        return () => {
            observer.disconnect()
            clearTimeout(observerTimeout)
            document.removeEventListener("submit", onSubmit, true)
        }
    }, [])

    return <div style={{ width: 0, height: 0 }} />
}
```

## Why two storages

They fail in opposite directions, so together they cover the real paths.

`sessionStorage` wins when the booking happens in the same tab, and it dies with the tab — which matters, because a shared front-desk computer is a completely normal way for our prospects to browse. `localStorage` covers Chili Piper opening the calendar in a new tab, or someone wandering off and coming back a minute later. The thirty-minute TTL is what stops it outliving the visit.

The visitor's email never appears in a URL, an analytics event, or a page log. It sits in their own browser for half an hour and then it doesn't.

## The whole flow

1. Prospect fills out the short demo form. Email goes to storage on submit.
2. Chili Piper routes and books, then redirects to `/demo/success` — clean URL, no payload.
3. Each question on that page posts with the email restored from storage, PATCHing the HubSpot contact answer by answer.
4. HubSpot syncs to Salesforce, and the AE opens a record that already answers the questions they'd have opened the call with.

## What actually changed

The form didn't get longer. The answers show up anyway. And the first demo meeting starts at the part worth having.

Two snippets. The rest was already in your stack.
