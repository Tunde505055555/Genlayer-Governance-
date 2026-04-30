# v0.2.16
# { "Depends": "py-genlayer:test" }

from genlayer import *

import json
import typing


class AIGovernance(gl.Contract):
    proposals: TreeMap[u256, str]          # id -> proposal text
    decisions: TreeMap[u256, str]          # id -> "APPROVE" | "REJECT"
    reasons: TreeMap[u256, str]            # id -> reason
    proposers: TreeMap[u256, str]          # id -> proposer address (string)
    next_id: u256

    def __init__(self):
        self.next_id = u256(0)

    @gl.public.view
    def get_proposal_count(self) -> int:
        return int(self.next_id)

    @gl.public.view
    def get_proposal(self, proposal_id: int) -> typing.Any:
        pid = u256(proposal_id)
        if proposal_id < 0 or proposal_id >= int(self.next_id):
            return None
        return {
            "id": int(pid),
            "proposer": self.proposers[pid],
            "proposal": self.proposals[pid],
            "decision": self.decisions[pid],
            "reason": self.reasons[pid],
        }

    @gl.public.view
    def get_all_proposals(self) -> typing.Any:
        result = []
        total = int(self.next_id)
        for i in range(total):
            pid = u256(i)
            result.append({
                "id": i,
                "proposer": self.proposers[pid],
                "proposal": self.proposals[pid],
                "decision": self.decisions[pid],
                "reason": self.reasons[pid],
            })
        return result

    @gl.public.write
    def submit_proposal(self, proposal_text: str) -> typing.Any:
        proposer = str(gl.message.sender_address)
        proposal_id = self.next_id

        def evaluate() -> typing.Any:
            task = f"""You are an AI governance evaluator. A user has submitted the following proposal to a decentralized organization. Evaluate it carefully on these criteria:

1. Clarity: Is the proposal clear and well-defined?
2. Feasibility: Is it realistically achievable?
3. Benefit: Does it benefit the community / organization?
4. Safety: Does it avoid harm, fraud, or malicious intent?
5. Legality and ethics: Is it legal and ethical?

PROPOSAL:
\"\"\"
{proposal_text}
\"\"\"

Respond with ONLY a valid JSON object in this exact format and nothing else:
{{
  "decision": "APPROVE" or "REJECT",
  "reason": "<one or two sentences explaining the decision>"
}}
"""
            result = gl.nondet.exec_prompt(task)
            result = result.strip()
            # Strip markdown fences if any
            if result.startswith("```"):
                result = result.strip("`")
                if result.lower().startswith("json"):
                    result = result[4:]
            result = result.strip()
            return result

        raw = gl.eq_principle.prompt_comparative(
            evaluate,
            "The two outputs must agree on the decision field (APPROVE or REJECT). Reasons may differ in wording.",
        )

        decision = "REJECT"
        reason = "Could not parse evaluator response."
        try:
            parsed = json.loads(raw)
            d = str(parsed.get("decision", "")).upper().strip()
            if d in ("APPROVE", "REJECT"):
                decision = d
            reason = str(parsed.get("reason", reason))[:500]
        except Exception:
            up = raw.upper()
            if "APPROVE" in up and "REJECT" not in up:
                decision = "APPROVE"
            elif "REJECT" in up:
                decision = "REJECT"
            reason = raw[:500]

        self.proposals[proposal_id] = proposal_text
        self.decisions[proposal_id] = decision
        self.reasons[proposal_id] = reason
        self.proposers[proposal_id] = proposer
        self.next_id = u256(int(self.next_id) + 1)

        return {
            "id": int(proposal_id),
            "decision": decision,
            "reason": reason,
        }
