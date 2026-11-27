import copy
import unittest

from task_setting import validate_task_setting


def task(instructions=False, simulator=False):
    result = {"task_id": "example", "user_simulation_metadata": {}, "environment_config": {}}
    if instructions:
        result["environment_config"]["developer_instruction"] = {
            "instruction_text": "Wait for permission before staging.",
            "developer_instruction_chunks": [{
                "instruction": "Wait for permission before staging.", "applicable": True,
                "rubrics": [{"rubric": "Permission precedes staging.", "applicable": True}],
            }],
        }
    if simulator:
        result["user_simulation_metadata"]["user_goals"] = [{
            "goal": "Stage only after permission.",
            "hidden_information": {"permission": "Go ahead."},
        }]
    return result


class TaskSettingTests(unittest.TestCase):
    def test_all_four_valid_settings(self):
        for setting, instructions, simulator in [("ST", False, False), ("IF", True, False),
                                                  ("MT", False, True), ("MTIF", True, True)]:
            with self.subTest(setting=setting):
                self.assertEqual(validate_task_setting(task(instructions, simulator), setting), setting)

    def test_gold_dialogue_cannot_supply_missing_simulator(self):
        record = task(True, False)
        record["gold_trajectories"] = [{"steps": [{"role": "USER", "content": "Go ahead."}]}]
        record["task_properties"] = {"backstory": "The user will provide permission."}
        with self.assertRaisesRegex(ValueError, "published setting MTIF.*\\(IF\\)"):
            validate_task_setting(record, "MTIF")

    def test_empty_simulator_container_is_not_multiturn(self):
        record = task(True, False)
        record["user_simulation_metadata"]["user_goals"] = []
        with self.assertRaisesRegex(ValueError, "simulator information=False"):
            validate_task_setting(record, "MTIF")

    def test_blank_fields_cannot_activate_runtime_without_a_meaningful_goal(self):
        for user in [
            {"user_goals": [{"goal": " "}]},
            {"user_goals": [{}]},
            {"user_goals": [{"hidden_information": {"permission": " "}}]},
        ]:
            record = task()
            record["user_simulation_metadata"] = user
            with self.subTest(user=user), self.assertRaisesRegex(ValueError, "blank"):
                validate_task_setting(record, "ST")
        record = task()
        record["environment_config"]["developer_instruction"] = {"instruction_text": " "}
        with self.assertRaisesRegex(ValueError, "blank developer prompt"):
            validate_task_setting(record, "ST")

    def test_instruction_text_without_active_check_is_rejected(self):
        record = task(True, False)
        record["environment_config"]["developer_instruction"]["developer_instruction_chunks"][0]["rubrics"][0]["applicable"] = False
        with self.assertRaisesRegex(ValueError, "lacks active"):
            validate_task_setting(record, "IF")

    def test_reverse_misclassification_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "published setting IF.*\\(MTIF\\)"):
            validate_task_setting(task(True, True), "IF")
        with self.assertRaisesRegex(ValueError, "published setting ST.*\\(IF\\)"):
            validate_task_setting(task(True, False), "ST")

    def test_mismatched_prompt_and_enum_are_rejected(self):
        record = task(True, True)
        wrong_prompt = copy.deepcopy(record)
        wrong_prompt["environment_config"]["developer_instruction"]["instruction_text"] = "Proceed immediately."
        with self.assertRaisesRegex(ValueError, "joined developer prompt"):
            validate_task_setting(wrong_prompt, "MTIF")
        record["task_properties"] = {"task_category": "INSTRUCTION_FOLLOWING_SAMPLE"}
        with self.assertRaisesRegex(ValueError, "task enum"):
            validate_task_setting(record, "MTIF")


if __name__ == "__main__":
    unittest.main()
