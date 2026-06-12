# -*- coding: utf-8 -*-
"""
测试 parse_schedule.py 的两项核心修复：
A. 动态表头解析 + 空列继承
B. 教师白名单反向切分
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from scripts.parse_schedule import (
    _normalize_period,
    clean_teacher_whitelist,
    build_teacher_regex,
    apply_teacher_whitelist,
    VALID_SLOTS,
)


# ========== Case A: 表头节次归一化与空列继承 ==========

def test_normalize_period():
    """测试节次文本归一化"""
    assert _normalize_period('1、2节') == 1
    assert _normalize_period('3,4') == 2
    assert _normalize_period('5-6') == 3
    assert _normalize_period('7—8节') == 4
    assert _normalize_period('9、10') == 5
    assert _normalize_period('11-12节') == 6   # 应被过滤
    assert _normalize_period('中午') == 7
    assert _normalize_period('') is None
    assert _normalize_period('  ') is None
    print("[OK] _normalize_period 通过")


def test_valid_slots_filter():
    """确认 11-12 节(slot=6)不在允许集合中"""
    assert 6 not in VALID_SLOTS
    assert {1, 2, 3, 4, 5, 7}.issubset(VALID_SLOTS)
    print("[OK] VALID_SLOTS 正确过滤 slot=6")


def test_header_inheritance_simulation():
    """
    模拟表头解析中的空列继承逻辑。
    输入（data columns only）: ['1、2', '3、4', '', '5、6']
    期望映射: col0→slot1, col1→slot2, col2→slot2(继承), col3→slot3
    """
    period_texts = ['1、2', '3、4', '', '5、6']
    expected = [1, 2, 2, 3]

    slots = []
    last_slot = None
    for text in period_texts:
        slot = _normalize_period(text)
        if slot is None and last_slot is not None:
            slot = last_slot
        if slot is not None:
            slots.append(slot)
            last_slot = slot

    assert slots == expected, f"期望 {expected}, 实际 {slots}"
    print("[OK] 空列继承逻辑通过: ['1、2', '3、4', '', '5、6'] → slots={expected}")


# ========== Case B: 教师白名单清洗与粘连修正 ==========

def test_clean_teacher_whitelist():
    """测试脏数据剔除：后缀也在名单中的长名字被移除"""
    raw = ['张测试', '应用张测试', '李样例', '应用李样例', '王虚构', '计王虚构', '赵演示']
    clean = clean_teacher_whitelist(raw)

    assert '张测试' in clean
    assert '李样例' in clean
    assert '王虚构' in clean
    assert '赵演示' in clean
    assert '应用张测试' not in clean
    assert '应用李样例' not in clean
    assert '计王虚构' not in clean
    print("[OK] 白名单清洗正确剔除粘连脏数据")


def test_whitelist_fix_lianzhan():
    """
    测试 course/teacher 粘连修正：
    parse_cell_content 可能将 "单片机技术应用张测试" 拆成
    course="单片机技术", teacher="应用张测试"；
    白名单应修正为 course="单片机技术应用", teacher="张测试"。
    """
    whitelist = ['张测试', '李样例', '王虚构']
    regex = build_teacher_regex(whitelist)
    whitelist_set = set(whitelist)

    records = [
        {"course_name": "单片机技术", "teacher": "应用张测试"},
    ]

    fixed = apply_teacher_whitelist(records, regex, whitelist_set)

    assert fixed[0]["course_name"] == "单片机技术应用", f"course: {fixed[0]['course_name']}"
    assert fixed[0]["teacher"] == "张测试", f"teacher: {fixed[0]['teacher']}"
    print("[OK] 白名单修正粘连虚构样例")


def test_whitelist_skip_valid():
    """已在白名单的教师不应被改动"""
    whitelist = ['李样例', '王虚构']
    regex = build_teacher_regex(whitelist)
    whitelist_set = set(whitelist)

    records = [
        {"course_name": "大学英语", "teacher": "李样例"},
    ]

    fixed = apply_teacher_whitelist(records, regex, whitelist_set)

    assert fixed[0]["course_name"] == "大学英语"
    assert fixed[0]["teacher"] == "李样例"
    print("[OK] 白名单跳过已正确教师")


def test_whitelist_fix_none_teacher():
    """教师为 None 时，若课程末尾包含白名单教师，也应切分"""
    whitelist = ['李样例']
    regex = build_teacher_regex(whitelist)
    whitelist_set = set(whitelist)

    records = [
        {"course_name": "体能训练周5学时李样例", "teacher": ""},
    ]

    fixed = apply_teacher_whitelist(records, regex, whitelist_set)

    # 应切分为 course="体能训练周5学时", teacher="李样例"
    assert fixed[0]["teacher"] == "李样例", f"teacher: {fixed[0]['teacher']}"
    assert "李样例" not in fixed[0]["course_name"]
    print("[OK] 白名单修正无教师字段的情况")


def test_whitelist_longest_priority():
    """长名字优先匹配，避免部分匹配"""
    whitelist = ['张测试', '张测']
    regex = build_teacher_regex(whitelist)
    whitelist_set = set(whitelist)

    records = [
        {"course_name": "美育", "teacher": "张测试"},
    ]

    fixed = apply_teacher_whitelist(records, regex, whitelist_set)

    assert fixed[0]["teacher"] == "张测试"
    assert fixed[0]["course_name"] == "美育"
    print("[OK] 长名字优先匹配避免误切")


if __name__ == "__main__":
    test_normalize_period()
    test_valid_slots_filter()
    test_header_inheritance_simulation()
    test_clean_teacher_whitelist()
    test_whitelist_fix_lianzhan()
    test_whitelist_skip_valid()
    test_whitelist_fix_none_teacher()
    test_whitelist_longest_priority()
    print("\n[OK] All parse_schedule tests passed!")
