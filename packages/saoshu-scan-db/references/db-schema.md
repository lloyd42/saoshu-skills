# 扫书数据库表结构（JSONL）

## runs.jsonl
- run_id
- ingested_at
- report_generated_at
- title / author / tags
- target_defense
- verdict / rating
- batch_count
- pipeline_mode / coverage_mode / coverage_template / serial_status
- sample_mode / sample_level
- total_batches / selected_batches / coverage_ratio
- coverage_gap_summary / coverage_gap_risk_types
- thunder_total / depression_total / risk_total
- keyword_candidate_total / alias_candidate_total / risk_question_candidate_total / relation_candidate_total
- input_txt / output_dir
- state_started_at / state_finished_at

## thunder_items.jsonl
- run_id / title
- rule / evidence_level / anchor / batch_id

## depression_items.jsonl
- run_id / title
- rule / severity / min_defense / evidence_level / anchor / batch_id

## risk_items.jsonl
- run_id / title
- risk / current_evidence / impact

## tag_items.jsonl
- run_id / title
- tag / count

## keyword_candidates.jsonl
- run_id / title / event_id
- rule_candidate / category
- keyword / source_kind
- review_decision / status
- subject_name / target_name
- chapter_range / chapter_num / chapter_title
- snippet

## keyword_promotions.jsonl
- promoted_at
- keyword / rule
- bucket（`thunder-risk|thunder-strict|depression|title-signal`）
- patterns[]
- title_type / weight / critical
- severity / min_defense / min_count
- note

## alias_candidates.jsonl
- run_id / title / event_id
- rule_candidate / review_decision / status
- role（`subject|target`）
- canonical_name / alias

## alias_promotions.jsonl
- promoted_at
- canonical_name / alias
- gender / role_hint / relation_label
- note

## risk_question_candidates.jsonl
- run_id / title
- risk / source_kind
- question
- current_evidence / impact

## risk_question_promotions.jsonl
- promoted_at
- risk / question
- note

## relation_candidates.jsonl
- run_id / title
- source_kind
- from / to / type
- weight / evidence
- event_id / rule_candidate

## relation_promotions.jsonl
- promoted_at
- from / to / type
- weight / evidence / source
- note

## mode_diff_entries.jsonl
- entry_hash / ingested_at / recorded_at
- compare_title / title / author / tags[]
- gain_window / band / score / coverage_ratio
- verdict_mismatch / risk_gap / follow_up_gap / relation_gap / event_gap / thunder_gap / depression_gap / rating_gap
- top_reason / reasons[]
- summary / action / next_step / third_mode_advice
- perf_report / econ_report
## 对比维度建议
- author（作者）
- tags（标签拆分后聚合）
- verdict（可看/慎入/劝退）
- pipeline_mode（economy/performance）
- target_defense（目标防御）
- title（按作品聚合）
- coverage_mode（sampled / chapter-full / full-book）
- coverage_template（如 opening-100 / head-tail / head-tail-risk / opening-latest）
- serial_status（unknown / ongoing / completed）
