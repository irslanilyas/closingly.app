-- Applied 2026-08-26.
--
-- The only writer was the standalone /proposal-generator page's "Save to
-- Pipeline" button, which wrote here directly instead of through the
-- proposals table — meaning every panel that shows whether a deal has a
-- proposal (ProposalPanel, ScopePanel, the public share page) never saw it,
-- since all of them read from `proposals`, not `deals.proposal_data`, since
-- the Phase 6 fix. That page is now deleted, so this column has no writer
-- left and nothing reads it either.
alter table deals drop column if exists proposal_data;
