# Permission and contact controls

## Permission states

- `permissioned`: authorized for this purpose, audience, and period.
- `restricted`: usable only under stated restrictions.
- `unknown`: authorization has not been established.
- `conflict-review`: a conflict owner must decide use/contact.
- `no-contact`: outreach or routing is prohibited.
- `expired`: prior permission no longer covers the current use.

Use the most restrictive state across source, relationship owner, candidate, deal, and organization. `no-contact` always wins.

## Relationship edge fields

`from_party`, `to_party`, `relationship_type`, `source_ref`, `last_verified_at`, `relationship_owner`, `permission_state`, `allowed_use`, `restricted_use`, `confidentiality`, `introduction_status`.

Do not infer trust, influence, friendship, or willingness from a contact list, co-attendance, title, shared school, or social-network connection.

## Contact gate

Before even preparing a recipient-specific outreach draft, require:

1. verified recipient identity;
2. relationship owner;
3. permission state that allows the purpose;
4. approved disclosed facts and confidentiality tier;
5. conflict/no-contact clearance;
6. approved side and sender identity.

Sending, scheduling, CRM mutation, or any external action remains outside this Skill and requires separate explicit approval.

## Privacy minimization

Retain only information necessary for sourcing and routing. Do not include sensitive personal traits, family information, private opinions, unverified reputation claims, or relationship notes outside their approved audience. Never use confidential relationship data as public examples or test fixtures.
