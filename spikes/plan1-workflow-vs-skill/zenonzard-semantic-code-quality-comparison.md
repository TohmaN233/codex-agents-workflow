# Zenonzard PC02R: Workflow vs Skill direct implementation review

This review evaluates the checked-out implementations themselves. Test outcomes are corroborating evidence only.

## Strict semantic pass rule

A card passes only when direct review found no semantic or lifecycle bug. `Partial` and `Material gap` are both failures; there is no partial credit. Tests do not turn a card into a pass when source review finds a contradiction.

## Result

| Implementation | Strictly passing cards | Pass rate | Cards with a reviewed bug |
| --- | ---: | ---: | ---: |
| Workflow Run artifact | **28 / 31** | **90.32%** | **3** |
| Skill | **20 / 31** | **64.52%** | **11** |
| Post-audit corrected checkout | **31 / 31** | **100.00%** | **0** |

The Workflow Run artifact passed 28 cards. Post-Run source review found three duration defects that the 62 generated scenarios missed; those later corrections raise the current checkout to 31/31 but do not retroactively change the experiment score. Granted keywords in the corrected checkout now use the card instance's existing `extra_keywords` state and persist until a zone transition resets card modifiers. Explicit turn-only keyword grants carry a `turn:keyword:*` marker and are removed at turn end. The Skill implementation is smaller and centralizes more shared card behavior, but it contradicts the authoritative source for Flair, lacks real gameplay registration for the three transform-source faces, and deliberately restores the printed face when a transformed card leaves the Field.

## Workflow Run defects found after completion

| Card | Workflow Run | Post-audit checkout |
| --- | --- | --- |
| blue_02_02_02r_00 | Partial: Infiltrate was cleared at turn end. | OK: persists until a zone reset. |
| red_08_02_02r_00 | Partial: the `-200 BP` modifier was cleared at turn end. | OK: persists until a zone reset. |
| white_07_02_02r_01 | Partial: Resurge was cleared at turn end. | OK: BP and Resurge persist until a zone reset. |

## Per-card semantic audit

`OK` means the reviewed code matches the pinned JP/EN card text and required lifecycle. `Partial` means the main behavior exists but one observable rule is wrong. `Material gap` means the face implementation exists but the normal gameplay path is absent or contradicted.

| Card | Corrected Workflow checkout | Skill | Direct finding |
| --- | --- | --- | --- |
| red_02_02_02r_01 | OK | OK | Optional neutral non-Minion Mana destruction and S-Golem creation are present. |
| red_02_03_02r_01 | OK | OK | Main/Flash selection is limited to an opposing Minion below printed BP. |
| red_04_02_02r_01 | OK | Partial | Both implement block damage and off-color transformation; Skill later restores the printed face on zone exit. |
| red_08_02_02r_00 | OK | Partial | Workflow now applies the authoritative persistent-on-zone `-200`. Skill makes the modifier persistent but changes the authoritative value and card text to `-100`. |
| yellow_02_02_02r_00 | OK | OK | Swoop is present. |
| yellow_03_02_02r_00 | OK | OK | Attack buff targets exactly one other allied Minion for the turn. |
| yellow_04_02_02r_01 | OK | Partial | Conditional +200/+1 and transformation exist; Skill restores the printed face on zone exit. |
| yellow_08_02_02r_00 | OK | OK | Swoop and two-target turn buff are present. |
| purple_03_02_02r_00 | OK | OK | Bless grants one persistent-on-field destroy ability and the cost cap is enforced. |
| purple_03_03_02r_00 | OK | OK | Force damage and Life recovery are coupled in the cast effect. |
| purple_04_02_02r_00 | OK | Partial | Attack mill and off-color transformation exist; Skill restores the printed face on zone exit. |
| purple_04_02_02r_01 | OK | OK | Cannot-block and non-stacking Trash return are present. |
| purple_07_02_02r_01 | OK | Material gap | Both face effects exist. Workflow registers the printed source and Bless-to-transform path; Skill registers only the transformed face, so normal transformation is unreachable. Skill also resets transformed identity on zone exit. |
| green_02_02_02r_00 | OK | OK | Global neutral Field-Minion hand-cost increase and destruction trigger are present. |
| green_03_02_02r_00 | OK | OK | Tone Down is created from outside the game. |
| green_04_02_02r_01 | OK | Partial | End-turn heal and transformation exist; Skill restores the printed face on zone exit. |
| green_08_02_02r_00 | OK | OK | Pierce and draw-three destruction effect are present. |
| blue_02_02_02r_00 | OK | OK | Both grant Infiltrate without a turn limit. Workflow clears the grant through the shared zone-transition reset. |
| blue_04_02_02r_00 | OK | OK | Summon grants one movement right. |
| blue_04_02_02r_02 | OK | Partial | Magic-use movement and transformation exist; Skill restores the printed face on zone exit. |
| blue_07_02_02r_01 | OK | Material gap | Face behavior is implemented in both. Workflow registers the source face and transformation; Skill does not. Skill also resets transformed identity on zone exit. |
| white_02_03_02r_00 | OK | OK | Turn BP buff and opponent effect-selection protection are present. |
| white_04_02_02r_00 | OK | Partial | Battle-winner banish and transformation exist; Skill restores the printed face on zone exit. |
| white_04_02_02r_02 | OK | OK | Each damage event grants persistent-on-field BP. |
| white_07_02_02r_01 | OK | Material gap | Workflow registers the real transformation path and grants persistent-on-zone BP and Resurge. Skill implements the face duration correctly but never registers its source face, and resets transformed identity on zone exit. |
| colorless_00_02_02r_00 | OK | OK | Hand cost tracks current Life. |
| colorless_02_02_02r_01 | OK | OK | Opponent receives the cannot-block Slime token. |
| colorless_04_02_02r_01 | OK | Partial | Draw and colored-Bless return-to-Base transform are present; Skill restores the printed face on zone exit. |
| colorless_04_02_02r_03 | OK | OK | Summon destroys one printed-neutral opposing Minion. |
| colorless_06_02_02r_01 | OK | OK | Opponent-turn Life attack refresh is present. |
| colorless_010_02_02r_00 | OK | OK | Attack damage is three minus the opponent's surviving Forces. |

Workflow Run strict semantic result: `28 / 31` (`90.32%`). Its failing cards are `blue_02_02_02r_00`, `red_08_02_02r_00`, and `white_07_02_02r_01`.

Post-audit corrected checkout: `31 / 31` (`100.00%`). This is a later repaired state, not the Workflow Run score.

Skill strict semantic result: `20 / 31` (`64.52%`). Its failing cards are `red_04_02_02r_01`, `red_08_02_02r_00`, `yellow_04_02_02r_01`, `purple_04_02_02r_00`, `purple_07_02_02r_01`, `green_04_02_02r_01`, `blue_04_02_02r_02`, `blue_07_02_02r_01`, `white_04_02_02r_00`, `white_07_02_02r_01`, and `colorless_04_02_02r_01`.

## Code-quality findings

The Workflow version keeps the 31 card faces in separate modules and adds generic engine seams such as `cost_aura`, Bless policy fields, and `transform_card`. It does not add PC02R card IDs to the core engine. It also registers the three printed transform-source cards explicitly. Its largest maintenance defect is six near-copies of the Anju color/form map and transformation procedure. The card layer is 33 files and about 2,033 lines.

The Skill version is one 588-line module with centralized Anju helpers and less duplication. However, its engine imports `zz.pc02r` hooks for turn-end behavior and cost calculation, checks PC02R card IDs directly, and carries PC02R flags through destruction. That makes the engine depend on this pack. The smaller file count therefore does not translate into better containment.

## Token and API-equivalent cost by model

| Arm / model | Uncached input | Cached input | Output | Total tokens | API-equivalent cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Skill / GPT-6 Sol | 261,203 | 27,776,768 | 84,622 | **28,122,593** | **$6.9240** |
| Workflow / GPT-6 Sol | 259,640 | 9,745,664 | 33,421 | **10,038,725** | **$2.8026** |
| Workflow / GPT-6 Luna | 1,490,380 | 21,927,936 | 443,955 | **23,862,271** | **$0.5903** |
| **Workflow total** | **1,750,020** | **31,673,600** | **477,376** | **33,900,996** | **$3.3929** |

Workflow used 18,083,868 fewer Sol tokens and added 23,862,271 Luna tokens, for a net increase of **5,778,403 tokens (20.55%)**. The extra tokens are visible in the Luna subagents' repeated project and task-context reads. Luna's lower price makes the Workflow's API-equivalent cost **51.00% lower** despite the higher token count. The discarded failed repair is disclosed separately in the machine-readable ledger and is not part of the completed implementation total.

The Run's final model relay returned an empty object even though upstream review had shipped. That relay was semantically unnecessary. Revision 3 removes it and finalizes directly through the guarded metadata Host tool. Exact model accounting and strict-pass IDs are in `zenonzard-composed-final-usage.json`.
