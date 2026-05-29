import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'scripts'))

from parse_cell import parse_cell_content


def test_case_1_two_courses_two_rooms():
    """大学英语 于秀杰 11-504 大学日语 葛书 11-223 (应拆分为2条)"""
    text = "大学英语 于秀杰 11-504 大学日语 葛书 11-223"
    result = parse_cell_content(text)
    assert len(result) == 2, f"Expected 2 records, got {len(result)}: {result}"

    # 第一条：大学英语
    r1 = result[0]
    assert r1["course_name"] == "大学英语", f"r1 course_name: {r1['course_name']}"
    assert r1["teacher"] == "于秀杰", f"r1 teacher: {r1['teacher']}"
    assert r1["classroom"] == "11-504", f"r1 classroom: {r1['classroom']}"

    # 第二条：大学日语
    r2 = result[1]
    assert r2["course_name"] == "大学日语", f"r2 course_name: {r2['course_name']}"
    assert r2["teacher"] == "葛书", f"r2 teacher: {r2['teacher']}"
    assert r2["classroom"] == "11-223", f"r2 classroom: {r2['classroom']}"

    print("[OK] Case 1 passed: 两个教室拆分为2条")


def test_case_2_two_courses_one_room():
    """职业素养 5-8周 孙文哲 大学生职业发展与就业指导 9-16周 孙文哲 11-239 (应拆分为2条)"""
    text = "职业素养 5-8周 孙文哲 大学生职业发展与就业指导 9-16周 孙文哲 11-239"
    result = parse_cell_content(text)
    assert len(result) == 2, f"Expected 2 records, got {len(result)}: {result}"

    # 注意：由于只有一个教室，拆分逻辑可能需要更复杂的处理
    # 这里我们先检查是否至少有2条，且都包含关键课程名
    names = [r["course_name"] for r in result]
    assert "职业素养" in names, f"Missing 职业素养 in {names}"
    assert "大学生职业发展与就业指导" in names, f"Missing 大学生职业发展与就业指导 in {names}"

    # 找到对应的记录
    r1 = next(r for r in result if r["course_name"] == "职业素养")
    r2 = next(r for r in result if r["course_name"] == "大学生职业发展与就业指导")

    assert r1["weeks"] == "5-8周", f"r1 weeks: {r1['weeks']}"
    assert r1["teacher"] == "孙文哲", f"r1 teacher: {r1['teacher']}"

    assert r2["weeks"] == "9-16周", f"r2 weeks: {r2['weeks']}"
    assert r2["teacher"] == "孙文哲", f"r2 teacher: {r2['teacher']}"
    assert r2["classroom"] == "11-239", f"r2 classroom: {r2['classroom']}"

    print("[OK] Case 2 passed: 单教室周次区分拆分为2条")


def test_case_3_with_remark():
    """形势与政策 胡 浩 前八周 与森防合班 1-142 (教师:胡浩, 教室:1-142, 备注:与森防合班)"""
    text = "形势与政策 胡 浩 前八周 与森防合班 1-142"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "形势与政策", f"course_name: {r['course_name']}"
    assert r["teacher"] == "胡浩", f"teacher: {r['teacher']}"
    assert r["weeks"] == "前八周", f"weeks: {r['weeks']}"
    assert r["remark"] == "与森防合班", f"remark: {r['remark']}"
    assert r["classroom"] == "1-142", f"classroom: {r['classroom']}"

    print("[OK] Case 3 passed: 合班备注提取正确")


def test_case_4_alt_room():
    """冶金设备维护 宋如武 11-322 或 10-104 (教室提取为数组或取第一个)"""
    text = "冶金设备维护 宋如武 11-322 或 10-104"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "冶金设备维护", f"course_name: {r['course_name']}"
    assert r["teacher"] == "宋如武", f"teacher: {r['teacher']}"
    # 教室可以是数组或单个
    assert r["classroom"] in ["11-322", ["11-322", "10-104"]], f"classroom: {r['classroom']}"

    print("[OK] Case 4 passed: 备用教室处理正确")


def test_case_5_dirty_data():
    """汽车营销（非学徒制） 刘艳 艳 林校 304 或 企业学徒实训（学徒制） 赵 俣绗 (拆分或提取主课程，其余入备注)"""
    text = "汽车营销（非学徒制） 刘艳 艳 林校 304 或 企业学徒实训（学徒制） 赵 俣绗"
    result = parse_cell_content(text)

    # 这个样本非常脏，我们至少要求：
    # 1. 不要崩溃
    # 2. 能提取出"汽车营销（非学徒制）"作为主课程名
    # 3. 能识别"林校304"作为教室
    assert len(result) >= 1, f"Expected at least 1 record, got {len(result)}"

    # 找到包含"汽车营销"的记录
    main = None
    for r in result:
        if r["course_name"] and "汽车营销" in r["course_name"]:
            main = r
            break

    assert main is not None, f"Missing 汽车营销 record in {result}"
    assert "林校" in str(main.get("classroom", "")), f"Missing 林校304 in classroom: {main.get('classroom')}"

    print("[OK] Case 5 passed: 脏数据主课程提取正确")


def test_case_6_no_room():
    """体能训练 周 5 学时 杨景勋 (无教室，教室为null)"""
    text = "体能训练 周 5 学时 杨景勋"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "体能训练", f"course_name: {r['course_name']}"
    assert r["teacher"] == "杨景勋", f"teacher: {r['teacher']}"
    assert r["classroom"] is None, f"classroom should be None, got: {r['classroom']}"

    print("[OK] Case 6 passed: 无教室情况处理正确")


def test_case_7_empty():
    """= 或 纯空格 (返回空列表)"""
    assert parse_cell_content("=") == [], "Failed on '='"
    assert parse_cell_content("   ") == [], "Failed on spaces"
    assert parse_cell_content("") == [], "Failed on empty string"
    assert parse_cell_content(None) == [], "Failed on None"

    print("[OK] Case 7 passed: 空/垃圾数据返回空列表")


def test_case_8_heban_remark():
    """美育 苏英周 11-529 合班24轧钢一二班 (教师:苏英周, 教室:11-529, 备注:合班24轧钢一二班)"""
    text = "美育 苏英周 11-529 合班24轧钢一二班"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "美育", f"course_name: {r['course_name']}"
    assert r["teacher"] == "苏英周", f"teacher: {r['teacher']}"
    assert r["classroom"] == "11-529", f"classroom: {r['classroom']}"
    assert r["remark"] == "合班24轧钢一二班", f"remark: {r['remark']}"

    print("[OK] Case 8 passed: 合班备注无'与'前缀提取正确")


def test_case_9_heuristic_zhanghongmei():
    """机械制图张红梅 11-318 → course=机械制图, teacher=张红梅, room=11-318"""
    text = "机械制图张红梅 11-318"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "机械制图", f"course_name: {r['course_name']}"
    assert r["teacher"] == "张红梅", f"teacher: {r['teacher']}"
    assert r["classroom"] == "11-318", f"classroom: {r['classroom']}"

    print("[OK] Case 9 passed: 启发式提取张红梅")


def test_case_10_heuristic_liuchuang():
    """林草环境刘闯 11-301 → course=林草环境, teacher=刘闯, room=11-301"""
    text = "林草环境刘闯 11-301"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "林草环境", f"course_name: {r['course_name']}"
    assert r["teacher"] == "刘闯", f"teacher: {r['teacher']}"
    assert r["classroom"] == "11-301", f"classroom: {r['classroom']}"

    print("[OK] Case 10 passed: 启发式提取刘闯")


def test_case_11_heuristic_application_blacklist():
    """单片机技术应用张旭 林校305 → course=单片机技术应用, teacher=张旭, room=林校305
    验证"应用"在黑名单中不被误认为教师，从而正确提取"张旭" """
    text = "单片机技术应用张旭 林校305"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "单片机技术应用", f"course_name: {r['course_name']}"
    assert r["teacher"] == "张旭", f"teacher: {r['teacher']}"
    assert "林校" in str(r.get("classroom", "")), f"classroom should contain 林校305: {r.get('classroom')}"

    print("[OK] Case 11 passed: '应用'黑名单过滤 + 张旭正确提取")


def test_case_12_heuristic_hehao():
    """形势与政策胡浩 前八周 1-142 → course=形势与政策, teacher=胡浩"""
    text = "形势与政策胡浩 前八周 1-142"
    result = parse_cell_content(text)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "形势与政策", f"course_name: {r['course_name']}"
    assert r["teacher"] == "胡浩", f"teacher: {r['teacher']}"

    print("[OK] Case 12 passed: 启发式提取胡浩")


# ===== 白名单权威匹配测试 (Cases 13-17) =====

def _make_regex(names):
    """辅助函数：构建教师白名单正则"""
    import re
    escaped = [re.escape(n) for n in sorted(names, key=len, reverse=True)]
    return re.compile('|'.join(escaped))


def test_case_13_whitelist_zhangxu():
    """单片机技术应用张旭 林校305 + [张旭] → course=单片机技术应用, teacher=张旭"""
    text = "单片机技术应用张旭 林校305"
    regex = _make_regex(['张旭'])
    result = parse_cell_content(text, regex)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "单片机技术应用", f"course_name: {r['course_name']}"
    assert r["teacher"] == "张旭", f"teacher: {r['teacher']}"
    assert "林校" in str(r.get("classroom", "")), f"classroom: {r.get('classroom')}"

    print("[OK] Case 13 passed: 白名单匹配张旭")


def test_case_14_whitelist_liuchuang():
    """林草环境刘闯 11-301 + [刘闯] → course=林草环境, teacher=刘闯"""
    text = "林草环境刘闯 11-301"
    regex = _make_regex(['刘闯'])
    result = parse_cell_content(text, regex)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "林草环境", f"course_name: {r['course_name']}"
    assert r["teacher"] == "刘闯", f"teacher: {r['teacher']}"
    assert r["classroom"] == "11-301", f"classroom: {r['classroom']}"

    print("[OK] Case 14 passed: 白名单匹配刘闯")


def test_case_15_whitelist_zhanghongmei():
    """机械制图张红梅 11-318 + [张红梅] → course=机械制图, teacher=张红梅"""
    text = "机械制图张红梅 11-318"
    regex = _make_regex(['张红梅'])
    result = parse_cell_content(text, regex)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "机械制图", f"course_name: {r['course_name']}"
    assert r["teacher"] == "张红梅", f"teacher: {r['teacher']}"

    print("[OK] Case 15 passed: 白名单匹配张红梅")


def test_case_16_whitelist_hehao():
    """形势与政策胡浩 前八周 1-142 + [胡浩] → course=形势与政策, teacher=胡浩"""
    text = "形势与政策胡浩 前八周 1-142"
    regex = _make_regex(['胡浩'])
    result = parse_cell_content(text, regex)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "形势与政策", f"course_name: {r['course_name']}"
    assert r["teacher"] == "胡浩", f"teacher: {r['teacher']}"

    print("[OK] Case 16 passed: 白名单匹配胡浩")


def test_case_17_whitelist_no_match():
    """外聘教师课程 11-101 + 白名单无匹配 → teacher=None, course=外聘教师课程"""
    text = "外聘教师课程 11-101"
    regex = _make_regex(['张旭', '刘闯'])  # 不包含"外聘"
    result = parse_cell_content(text, regex)
    assert len(result) == 1, f"Expected 1 record, got {len(result)}: {result}"

    r = result[0]
    assert r["course_name"] == "外聘教师课程", f"course_name: {r['course_name']}"
    assert r["teacher"] is None, f"teacher should be None, got: {r['teacher']}"

    print("[OK] Case 17 passed: 白名单无匹配时 teacher=None，不瞎猜")


if __name__ == "__main__":
    test_case_1_two_courses_two_rooms()
    test_case_2_two_courses_one_room()
    test_case_3_with_remark()
    test_case_4_alt_room()
    test_case_5_dirty_data()
    test_case_6_no_room()
    test_case_7_empty()
    test_case_8_heban_remark()
    test_case_9_heuristic_zhanghongmei()
    test_case_10_heuristic_liuchuang()
    test_case_11_heuristic_application_blacklist()
    test_case_12_heuristic_hehao()
    test_case_13_whitelist_zhangxu()
    test_case_14_whitelist_liuchuang()
    test_case_15_whitelist_zhanghongmei()
    test_case_16_whitelist_hehao()
    test_case_17_whitelist_no_match()
    print("\n[OK] All 17 test cases passed!")
