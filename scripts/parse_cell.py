# -*- coding: utf-8 -*-
import re
from typing import List, Dict, Any


# ---------- 常量正则 ----------
ROOM_PATTERNS = [
    r'\d+号楼[^\s]+(?:室|房)',   # 1号楼虚拟仿真实训室
    r'林校\s*\d+',              # 林校305
    r'\d+[-—]\d+(?![\d周])',   # 11-504, 1-142, 10-104（排除周次如5-8周、9-16周，防回溯）
    r'线上',                     # 线上
    r'\d+楼(?:机房|教室)',      # 12楼机房
]
ROOM_RE = re.compile('|'.join(ROOM_PATTERNS))
WEEK_RE = re.compile(r'(\d+-\d+周|前八周|后八周|单周(?:上)?|双周(?:上)?)')
HOURS_RE = re.compile(r'(?:周\s*)?\d+\s*学时')
REMARK_RE = re.compile(r'(?:合班[\s\d\w一二三四五六七八九十级班]*|与[^与\s）)]+合班)')

# 课程后缀黑名单：末尾 2-3 字若属于此类术语，不应被视为教师名
COURSE_SUFFIX_BLACKLIST = {
    '技术', '应用', '基础', '概论', '教育', '指导',
    '实训', '实验', '设计', '管理', '原理', '分析',
    '测试', '维护', '诊断', '控制', '系统', '工程',
    '制图', '栽培', '保护', '预防', '扑救', '法规',
    '实务', '营销', '服务', '英语', '日语', '俄语',
    '锻炼', '训练', '检修', '操作', '编程', '开发',
    '安装', '调试', '加工', '焊接', '测量', '检测',
    '维修', '运用', '运输', '驾驶', '安全', '环境',
    '礼仪', '文化', '素养', '就业', '创新', '创业',
    '劳动', '体育', '心理', '健康', '写作', '沟通',
    '策划', '运营', '会计', '财务', '经济', '法规',
    '鉴赏', '欣赏', '概论',
}

# 教师名黑名单（模块级，供 _extract_teacher 和 _parse_single_block 共用）
_TEACHER_BLACKLIST = {'班', '合班', '一二', '轧钢', '机电', '森防'}

# 常见姓氏表（用于从粘连文本中识别教师名）
COMMON_SURNAMES = set(
    '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'
    '戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐'
    '费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄'
    '和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁'
    '杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍'
    '虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左右石崔吉钮'
    '龚程嵇邢滑裴陆荣翁荀羊於惠甄麹家封芮羿储靳汲邴糜松井段富巫乌焦巴'
    '弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束'
    '龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍'
    '双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚'
    '农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满'
    '弘匡国文寇广禄阙东殴殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶'
    '空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'
)


def _remove_from_text(text: str, substr: str) -> str:
    """从文本中删除子串并清理多余空格。"""
    idx = text.find(substr)
    if idx >= 0:
        text = text[:idx] + text[idx + len(substr):]
    return re.sub(r'\s+', ' ', text).strip()


def _extract_teacher(text: str) -> tuple:
    """
    从粘连文本中提取末尾的教师名（1-4个汉字）。
    优先匹配以常见姓氏开头的较长序列，否则 fallback 到长度2-3。
    最后使用启发式兜底：提取末尾 2-3 个汉字，
    若不在 COURSE_SUFFIX_BLACKLIST 中，则强制认定为教师名。
    返回 (去除教师后的文本, 教师名或None)
    """
    # 清理末尾括号残留
    text = re.sub(r'[\s（）()]+$', '', text.strip())
    if not text:
        return text, None

    # 第一轮：按长度从长到短，优先匹配以常见姓氏开头的
    for length in range(4, 0, -1):
        m = re.search(r'([一-龥]{%d})$' % length, text)
        if not m:
            continue
        candidate = m.group(1)
        course = text[:m.start()].strip()
        if len(course) < 2:
            continue
        if candidate[0] in COMMON_SURNAMES:
            # 检查候选名前缀是否属于课程后缀（如 "应用张旭" 中 "应用"
            # 是课程术语 → 跳过，让更短的候选或启发式兜底来处理）
            has_course_prefix = False
            for pref_len in (2, 3):
                if len(candidate) > pref_len and candidate[:pref_len] in COURSE_SUFFIX_BLACKLIST:
                    has_course_prefix = True
                    break
            if not has_course_prefix:
                return course, candidate

    # 第二轮：fallback，长度 2-3 直接接受
    for length in (3, 2):
        m = re.search(r'([一-龥]{%d})$' % length, text)
        if not m:
            continue
        course = text[:m.start()].strip()
        if len(course) >= 2:
            return course, m.group(1)

    # 第三轮：启发式兜底 —— 末尾 2-3 汉字若不在课程后缀黑名单中，
    # 则强制认定为教师名（打破数据库白名单死循环）
    for length in (3, 2):
        m = re.search(r'([一-龥]{%d})$' % length, text)
        if not m:
            continue
        candidate = m.group(1)
        if candidate in COURSE_SUFFIX_BLACKLIST:
            continue
        course = text[:m.start()].strip()
        if len(course) < 2:
            continue
        # 候选名也不能在教师黑名单中
        if candidate not in _TEACHER_BLACKLIST:
            return course, candidate

    return text, None


def _extract_teacher_from_left(text: str) -> tuple:
    """
    从粘连文本的左侧提取教师名（用于周次之间的切分）。
    返回 (教师长度, 教师名或None)
    """
    text = text.strip()
    for length in range(3, 0, -1):
        if length > len(text):
            continue
        candidate = text[:length]
        remaining = text[length:]
        if candidate[0] in COMMON_SURNAMES and len(remaining) >= 2:
            return length, candidate
    return 0, None


def _parse_single_block(text: str, room: str = None, teacher_regex=None) -> Dict[str, Any]:
    """
    解析单个课程块。依次提取 remark -> week -> room -> teacher -> course_name。
    若提供 teacher_regex，则用白名单正则匹配教师名；否则回退到 _extract_teacher()。
    """
    text = text.strip()

    # 1. 提取合班备注
    remark = None
    m = REMARK_RE.search(text)
    if m:
        remark = m.group(0)
        text = _remove_from_text(text, m.group(0))

    # 2. 提取周次
    week = None
    m = WEEK_RE.search(text)
    if m:
        week = m.group(1)
        text = _remove_from_text(text, m.group(0))

    # 2.5 提取学时（如 "周 5 学时"）
    m = HOURS_RE.search(text)
    if m:
        text = _remove_from_text(text, m.group(0))

    # 3. 如果已传入 room，从 text 中删掉
    if room:
        text = _remove_from_text(text, room)

    # 4. 处理 "或 xxx" 这种备用教室
    alt_room = None
    if ' 或 ' in text or '或' in text:
        parts = text.rsplit(' 或 ', 1)
        if len(parts) == 2 and re.match(r'^\d+[-—]?\d+$', parts[1].strip()):
            alt_room = parts[1].strip()
            text = parts[0].strip()
        else:
            m = re.search(r'或\s*(\d+[-—]\d+)$', text)
            if m:
                alt_room = m.group(1)
                text = text[:m.start()].strip()

    # 5. 提取教师
    if teacher_regex is not None:
        # ===== 白名单权威匹配模式 =====
        # 在核心文本中搜索教师白名单正则，匹配到则切分，
        # 匹配不到则回退到启发式提取（处理名单外的教师）
        teacher = None
        match = teacher_regex.search(text)
        if match:
            teacher = match.group(0)
            course_name = text[:match.start()].strip()
            # 教师名之后的残留文本（若有）
            after = text[match.end():].strip()
            if after:
                if remark:
                    remark = remark + ' ' + after
                else:
                    remark = after
        else:
            # 白名单未匹配，回退到启发式提取
            text, teacher = _extract_teacher(text)
            course_name = text.strip()
    else:
        # ===== 回退到原有姓氏 + 启发式提取（无白名单时） =====
        text, teacher = _extract_teacher(text)
        course_name = text.strip()

    course_name = re.sub(r'\s*或\s*$', '', course_name).strip()

    # 教师名黑名单兜底
    if teacher in _TEACHER_BLACKLIST:
        teacher = None

    result = {
        "course_name": course_name if course_name else None,
        "teacher": teacher,
        "classroom": room,
        "weeks": week,
        "remark": remark,
    }
    if alt_room:
        result["classroom"] = [room, alt_room] if room else [alt_room]

    return result


def parse_cell_content(cell_text: str, teacher_regex=None) -> List[Dict[str, Any]]:
    """
    解析课表单元格内容，提取课程信息。
    核心思想：以"教室"为锚点，辅以"周次"和"或"为锚点，进行逆向切分。
    若提供 teacher_regex，则在提取教师时使用白名单权威匹配；
    否则回退到姓氏+启发式提取。
    """
    if not cell_text or not isinstance(cell_text, str):
        return []

    text = cell_text.strip()
    if not text or text in ('=', '＝', '—', '-', ' ', '  '):
        return []

    # 全局消除中文间的幽灵空格
    text = re.sub(r'(?<=[一-龥])\s+(?=[一-龥])', '', text)

    # 找到所有教室和周次
    rooms = list(ROOM_RE.finditer(text))
    weeks = list(WEEK_RE.finditer(text))

    blocks = []  # [(sub_text, room_or_None), ...]

    # ---------- 策略1：两个及以上教室 ----------
    if len(rooms) >= 2:
        first_end = rooms[0].end()
        second_start = rooms[1].start()
        mid = text[first_end:second_start]

        # 判断是否是备用教室：中间只有"或"和空格/标点
        if re.match(r'^[\s或/\\]*$', mid):
            blocks.append((text, rooms[0].group()))
        else:
            seg1 = text[:first_end].strip()
            seg2 = text[first_end:].strip()
            blocks.append((seg1, rooms[0].group()))
            blocks.append((seg2, rooms[1].group()))

    # ---------- 策略2：只有一个教室，但有"或"分隔 ----------
    elif len(rooms) == 1 and (' 或 ' in text or '或' in text):
        or_pos = text.find(' 或 ')
        if or_pos < 0:
            or_pos = text.find('或')

        after_or = text[or_pos + 1:].strip() if or_pos >= 0 else ''

        if after_or and re.match(r'[一-龥]', after_or):
            room_str = rooms[0].group()
            room_pos = text.find(room_str)

            seg1 = text[:or_pos].strip()
            seg2 = text[or_pos + 1:].strip()

            if room_pos < or_pos:
                blocks.append((seg1, room_str))
                blocks.append((seg2, None))
            else:
                blocks.append((seg1, None))
                blocks.append((seg2, room_str))
        else:
            blocks.append((text, rooms[0].group()))

    # ---------- 策略3：只有一个教室，两个及以上周次 ----------
    elif len(rooms) == 1 and len(weeks) >= 2:
        room_str = rooms[0].group()
        week_positions = [(m.start(), m.end(), m.group(1)) for m in weeks]

        # 最后一个周次段获得教室
        last_wk_start = week_positions[-1][0]
        blocks.insert(0, (text[last_wk_start:], room_str))

        # 从右往左处理每个周次
        for i in range(len(week_positions) - 2, -1, -1):
            curr_wk_start = week_positions[i][0]
            curr_wk_end = week_positions[i][1]
            next_wk_start = week_positions[i + 1][0]

            # 两个周次之间的文本：teacher_i + course_name_{i+1}
            between = text[curr_wk_end:next_wk_start]

            # 从 between 的左侧提取当前课程的教师名
            teacher_len, _ = _extract_teacher_from_left(between)

            split_point = curr_wk_end + teacher_len
            seg = text[curr_wk_start:split_point]
            blocks.insert(0, (seg, None))

            # 将下一个课程名 prepend 到下一个 block
            next_course_name = between[teacher_len:]
            if next_course_name:
                next_seg, next_room = blocks[1]
                blocks[1] = (next_course_name + next_seg, next_room)

        # 最前面可能还有残留的课程名
        first_wk_start = week_positions[0][0]
        if first_wk_start > 0:
            prefix = text[:first_wk_start].strip()
            if prefix:
                first_seg, first_room = blocks[0]
                blocks[0] = (prefix + ' ' + first_seg, first_room)

    # ---------- 策略4：只有一个教室 ----------
    elif len(rooms) == 1:
        blocks.append((text, rooms[0].group()))

    # ---------- 策略5：没有教室 ----------
    else:
        if ' 或 ' in text or '或' in text:
            parts = re.split(r'\s+或\s+', text)
            if len(parts) == 2:
                for p in parts:
                    blocks.append((p.strip(), None))
            else:
                blocks.append((text, None))
        else:
            blocks.append((text, None))

    # ---------- 解析每个 block ----------
    results = []
    for seg_text, room in blocks:
        if not seg_text or seg_text in ('=', '＝', '或'):
            continue
        record = _parse_single_block(seg_text, room, teacher_regex)
        if record.get("course_name"):
            results.append(record)

    return results
