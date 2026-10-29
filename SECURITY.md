# Security policy

This policy covers `react-native-softphone-sdk` and the FreJun APIs and SIP
services it talks to.

## Supported versions

Security fixes are released for the latest published major version only. Check
the [npm page](https://www.npmjs.com/package/react-native-softphone-sdk) for the
current version and upgrade before reporting.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues or
pull requests.**

Email [support@frejun.com](mailto:support@frejun.com) with the subject line
`SECURITY: react-native-softphone-sdk` and a description of the issue.

To help us reproduce and assess it quickly, include what you can of:

- the SDK version, React Native version, and platform (iOS / Android, OS version)
- the type of issue — for example token leakage, insecure token storage, OAuth
  redirect or code-interception issues, SIP credential exposure, or an
  authentication bypass
- step-by-step instructions to reproduce, with any proof-of-concept code
- the impact you believe it has, and which accounts or data it could reach

## What happens next

We will acknowledge your report by email, tell you whether we could reproduce
it, and keep you updated while we work on a fix. We appreciate reports made in good faith and, if you'd like, will
acknowledge your contribution when we publish the fix.

## Please do

- Give us a reasonable chance to fix the issue before disclosing it publicly.
- Test only against your own FreJun account, numbers, and data.
- Stop once you have confirmed the issue, and access only the minimum data
  needed to demonstrate it.

## Please do not

- Access, modify, or delete data belonging to another FreJun account.
- Run denial-of-service, load, or brute-force testing against FreJun services.
- Place calls to people who have not consented to your testing.

## If your credentials are exposed

If your OAuth `clientSecret`, an access or refresh token, or SIP credentials
have been exposed (for example committed to a public repository or bundled
into a shipped app), email [support@frejun.com](mailto:support@frejun.com)
straight away so we can revoke them and review account activity.

Never include live credentials in a report — redact them and tell us where they
were exposed instead.

## Non-security issues

For bugs without a security impact, open a normal issue. See
[CONTRIBUTING.md](./CONTRIBUTING.md).
