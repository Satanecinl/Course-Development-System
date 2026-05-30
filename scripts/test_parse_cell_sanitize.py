# -*- coding: utf-8 -*-
"""Parser course name sanitization tests."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from parse_cell import sanitize_course_name, parse_cell_content


def test_sanitize_course_name():
    """Test sanitize_course_name helper."""
    cases = [
        ('）机械制图', '机械制图'),
        ('） 机械制图', '机械制图'),
        (')机械制图', '机械制图'),
        (') 机械制图', '机械制图'),
        ('】机械制图', '机械制图'),
        ('、机械制图', '机械制图'),
        ('，机械制图', '机械制图'),
        ('机械制图', '机械制图'),
        ('习近平新时代中国特色社会主义思想概论', '习近平新时代中国特色社会主义思想概论'),
        ('创新创业教育', '创新创业教育'),
        ('金属材料与热处理', '金属材料与热处理'),
        ('', ''),
        (None, None),
    ]
    passed = 0
    failed = 0
    for input_val, expected in cases:
        result = sanitize_course_name(input_val)
        if result == expected:
            passed += 1
        else:
            failed += 1
            print(f'  FAIL: sanitize_course_name({input_val!r}) = {result!r}, expected {expected!r}')
    return passed, failed


def test_parse_cell_abnormal_cases():
    """Test that abnormal course names are sanitized in parse_cell_content.
    Uses realistic cell text with room/week anchors."""
    cases = [
        # (input_text, expected_course_name_should_not_start_with_orphan)
        ('杨景勋（）机械制图张红梅（双周上）11-333 3,4 1-16周', False),
        ('）机械制图张红梅 11-333 3,4 1-16周', False),
        ('） 机械制图张红梅 11-333 3,4 1-16周', False),
    ]
    passed = 0
    failed = 0
    for text, _ in cases:
        results = parse_cell_content(text)
        course_names = [r['course_name'] for r in results if r.get('course_name')]
        # Check that no course name starts with orphan punctuation
        bad = [c for c in course_names if c and c[0] in '）)】、，,;；:：']
        if not bad:
            passed += 1
        else:
            failed += 1
            print(f'  FAIL: parse_cell_content({text!r}) has orphan-prefixed courses: {bad}')
    return passed, failed


def test_parse_cell_normal_cases():
    """Test that normal course names are not damaged.
    Uses realistic cell text with room/week anchors."""
    cases = [
        ('习近平新时代中国特色社会主义思想概论张旭 11-322 1,2 1-16周', '习近平新时代中国特色社会主义思想概论'),
        ('创新创业教育徐燕 11-322 1,2 1-16周', '创新创业教育'),
        ('金属材料与热处理尹和鑫 11-322 1,2 1-16周', '金属材料与热处理'),
        ('传感器与检测技术张旭 11-322 1,2 1-16周', '传感器与检测技术'),
        ('高等数学李媛 11-322 1,2 1-16周', '高等数学'),
    ]
    passed = 0
    failed = 0
    for text, expected_course in cases:
        results = parse_cell_content(text)
        course_names = [r['course_name'] for r in results if r.get('course_name')]
        if expected_course in course_names:
            passed += 1
        else:
            failed += 1
            print(f'  FAIL: parse_cell_content({text!r}) courses={course_names}, expected to contain {expected_course!r}')
    return passed, failed


if __name__ == '__main__':
    total_passed = 0
    total_failed = 0

    print('=== sanitize_course_name tests ===')
    p, f = test_sanitize_course_name()
    total_passed += p
    total_failed += f
    print(f'  Passed: {p}, Failed: {f}')

    print('=== parse_cell_content abnormal cases ===')
    p, f = test_parse_cell_abnormal_cases()
    total_passed += p
    total_failed += f
    print(f'  Passed: {p}, Failed: {f}')

    print('=== parse_cell_content normal cases ===')
    p, f = test_parse_cell_normal_cases()
    total_passed += p
    total_failed += f
    print(f'  Passed: {p}, Failed: {f}')

    print(f'\n=== Summary ===')
    print(f'Passed: {total_passed}')
    print(f'Failed: {total_failed}')
    sys.exit(1 if total_failed > 0 else 0)
