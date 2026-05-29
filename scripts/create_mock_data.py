#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Mock Word 课程表数据，用于测试 parse_schedule.py 解析脚本

模拟工程应用技术学院的课程表结构：
- 表头：星期（一~五）跨列，节次（1,2 / 3,4 等）
- 第一列：班级名、辅导员、电话
- 单元格：多行文本，含课程名、教师、教室、周次限制
"""

from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


def set_cell_shading(cell, color):
    """设置单元格背景色"""
    shading = OxmlElement('w:shd')
    shading.set(qn('w:fill'), color)
    cell._tc.get_or_add_tcPr().append(shading)


def set_cell_border(cell):
    """设置单元格边框"""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for border_name in ['top', 'left', 'bottom', 'right']:
        border = OxmlElement(f'w:{border_name}')
        border.set(qn('w:val'), 'single')
        border.set(qn('w:sz'), '4')
        border.set(qn('w:space'), '0')
        border.set(qn('w:color'), '000000')
        tcBorders.append(border)
    tcPr.append(tcBorders)


def add_paragraph_with_lines(cell, lines: list):
    """在单元格中添加多行文本"""
    cell.text = ''
    for i, line in enumerate(lines):
        if i > 0:
            cell.add_paragraph()
        paragraph = cell.paragraphs[i]
        run = paragraph.add_run(line)
        run.font.size = Pt(9)
        run.font.name = '宋体'
        r = run._element
        r.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER


def create_mock_schedule(output_path: str = 'mock_schedule.docx'):
    """创建模拟课程表 Word 文档"""
    doc = Document()

    # 设置页面为横向
    section = doc.sections[0]
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.left_margin = Cm(1.5)
    section.right_margin = Cm(1.5)
    section.top_margin = Cm(1.5)
    section.bottom_margin = Cm(1.5)

    # 添加标题
    title = doc.add_paragraph('工程应用技术学院 2024-2025学年第二学期课程表')
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title.runs[0]
    title_run.font.size = Pt(16)
    title_run.font.bold = True
    title_run.font.name = '黑体'
    title_run._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')

    # 创建表格：11列（1班级 + 5天×2节次）
    # 列宽分配：班级列较宽，其他均匀
    table = doc.add_table(rows=8, cols=11)
    table.style = 'Table Grid'

    # 设置列宽
    widths = [Cm(3.5)] + [Cm(2.4)] * 10
    for row in table.rows:
        for idx, width in enumerate(widths):
            row.cells[idx].width = width

    # ===== 表头第1行：星期 =====
    header_row1 = table.rows[0]

    # 第一列：时间/班级
    cell = header_row1.cells[0]
    cell.text = '班级'
    set_cell_shading(cell, 'D9E1F2')
    for paragraph in cell.paragraphs:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in paragraph.runs:
            run.font.bold = True
            run.font.size = Pt(10)

    # 合并星期单元格（每两天一合并，代表上午和下午）
    day_names = ['星期一', '星期二', '星期三', '星期四', '星期五']
    for i, day in enumerate(day_names):
        start_col = 1 + i * 2
        end_col = start_col + 1

        # 合并单元格
        cell = header_row1.cells[start_col]
        cell.text = day
        cell.merge(header_row1.cells[end_col])
        set_cell_shading(cell, 'D9E1F2')
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in paragraph.runs:
                run.font.bold = True
                run.font.size = Pt(10)

    # ===== 表头第2行：节次 =====
    header_row2 = table.rows[1]

    # 第一列：辅导员/电话标签
    cell = header_row2.cells[0]
    cell.text = '辅导员/电话'
    set_cell_shading(cell, 'E7E6E6')
    for paragraph in cell.paragraphs:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in paragraph.runs:
            run.font.bold = True
            run.font.size = Pt(9)

    # 节次
    periods = ['1,2', '3,4', '1,2', '3,4', '1,2', '3,4', '1,2', '3,4', '1,2', '3,4']
    for i, period in enumerate(periods):
        cell = header_row2.cells[i + 1]
        cell.text = f'第{period}节'
        set_cell_shading(cell, 'E7E6E6')
        for paragraph in cell.paragraphs:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in paragraph.runs:
                run.font.bold = True
                run.font.size = Pt(9)

    # ===== 数据行 =====
    # 模拟数据：(班级名, 辅导员, 电话, 各时间段课程内容)
    # 每个时间段内容：列表，每个元素是一行文本
    mock_data = [
        {
            'class': '22工程造价1班',
            'advisor': '辅导员：李建国',
            'phone': '13812345678',
            'slots': [
                # 周一 1,2节
                ['建筑施工技术', '王教授', '11-322', '全周'],
                # 周一 3,4节
                ['工程经济学', '张老师', '林校305', '前八周'],
                # 周二 1,2节
                ['建筑结构', '刘工', '实训楼201', '后八周'],
                # 周二 3,4节
                [''],  # 空课
                # 周三 1,2节
                ['BIM技术应用', '陈老师', 'A-101', '单周上'],
                # 周三 3,4节
                ['工程项目管理', '赵老师', '11-415', '双周上'],
                # 周四 1,2节
                ['工程造价实务', '孙教授', '12-208', '1-12周'],
                # 周四 3,4节
                ['建筑法规', '周老师', '林校401'],
                # 周五 1,2节
                ['工程招投标', '吴老师', '11-501', '前八周'],
                # 周五 3,4节
                [''],  # 空课
            ]
        },
        {
            'class': '22建筑工程技术2班',
            'advisor': '辅导员：王芳',
            'phone': '13987654321',
            'slots': [
                # 周一 1,2节
                ['建筑材料', '李老师', '11-301'],
                # 周一 3,4节
                ['建筑力学', '赵教授', '12-105', '全周'],
                # 周二 1,2节
                ['建筑制图', '钱老师', '绘图室302', '前八周'],
                # 周二 3,4节
                ['建筑CAD', '孙老师', '机房201', '后八周'],
                # 周三 1,2节
                ['混凝土结构', '周教授', '11-402'],
                # 周三 3,4节
                ['钢结构', '吴老师', '12-310', '单周上'],
                # 周四 1,2节
                ['建筑施工组织', '郑老师', '11-205', '双周上'],
                # 周四 3,4节
                ['建筑工程测量', '冯老师', '实训楼105', '1-10周'],
                # 周五 1,2节
                ['建筑设备', '陈工', '林校202'],
                # 周五 3,4节
                [''],  # 空课
            ]
        },
        {
            'class': '23市政工程技术1班',
            'advisor': '辅导员：张伟',
            'phone': '13611112222',
            'slots': [
                # 周一 1,2节
                ['市政工程制图', '杨老师', '11-201', '全周'],
                # 周一 3,4节
                ['土力学与地基', '朱教授', '12-305'],
                # 周二 1,2节
                ['道路工程', '秦老师', '11-405', '前八周'],
                # 周二 3,4节
                ['桥梁工程', '尤老师', '林校302', '后八周'],
                # 周三 1,2节
                ['排水工程', '许老师', '12-201', '单周上'],
                # 周三 3,4节
                ['给水工程', '何老师', '11-308', '双周上'],
                # 周四 1,2节
                ['市政工程预算', '吕老师', 'A-205', '1-8周'],
                # 周四 3,4节
                ['工程监理', '施老师', '11-502'],
                # 周五 1,2节
                ['市政工程施工', '张老师', '实训楼301'],
                # 周五 3,4节
                [''],  # 空课
            ]
        },
        {
            'class': '23工程监理1班',
            'advisor': '辅导员：刘丽',
            'phone': '13733334444',
            'slots': [
                # 周一 1,2节
                ['监理概论', '孔老师', '11-106', '全周'],
                # 周一 3,4节
                ['质量控制', '曹老师', '12-207'],
                # 周二 1,2节
                ['进度控制', '严老师', '11-401', '前八周'],
                # 周二 3,4节
                ['投资控制', '华老师', '林校201', '后八周'],
                # 周三 1,2节
                ['合同管理', '金老师', '12-105', '单周上'],
                # 周三 3,4节
                ['信息管理', '魏老师', '11-303', '双周上'],
                # 周四 1,2节
                ['安全监理', '陶老师', 'A-301', '1-14周'],
                # 周四 3,4节
                ['监理案例分析', '姜老师', '11-205'],
                # 周五 1,2节
                [''],  # 空课
                # 周五 3,4节
                [''],  # 空课
            ]
        },
        {
            'class': '22建筑装饰工程技术1班',
            'advisor': '辅导员：赵强',
            'phone': '13555556666',
            'slots': [
                # 周一 1,2节
                ['装饰设计基础', '谢老师', '11-208', '全周'],
                # 周一 3,4节
                ['室内设计原理', '喻老师', '12-401'],
                # 周二 1,2节
                ['装饰材料', '柏老师', '11-305', '前八周'],
                # 周二 3,4节
                ['装饰施工技术', '水老师', '实训楼401', '后八周'],
                # 周三 1,2节
                ['3DMax建模', '窦老师', '机房302', '单周上'],
                # 周三 3,4节
                ['Photoshop', '章老师', '机房303', '双周上'],
                # 周四 1,2节
                ['装饰预算', '云老师', '11-506', '1-16周'],
                # 周四 3,4节
                ['家具设计', '苏老师', '12-102'],
                # 周五 1,2节
                ['软装设计', '潘老师', '11-302'],
                # 周五 3,4节
                [''],  # 空课
            ]
        },
    ]

    # 填充数据行（从第2行开始）
    for row_idx, data in enumerate(mock_data):
        row = table.rows[row_idx + 2]

        # 第一列：班级信息（多行）
        class_cell = row.cells[0]
        add_paragraph_with_lines(class_cell, [
            data['class'],
            data['advisor'],
            data['phone']
        ])
        set_cell_shading(class_cell, 'F2F2F2')

        # 填充各时间段
        for col_idx, slot_data in enumerate(data['slots']):
            cell = row.cells[col_idx + 1]

            if not slot_data or not slot_data[0]:
                cell.text = ''
                continue

            add_paragraph_with_lines(cell, slot_data)

            # 为不同的周次类型设置不同背景色
            if any(keyword in ' '.join(slot_data) for keyword in ['前八周', '前 8 周']):
                set_cell_shading(cell, 'FFF2CC')
            elif any(keyword in ' '.join(slot_data) for keyword in ['后八周', '后 8 周']):
                set_cell_shading(cell, 'E2EFDA')
            elif any(keyword in ' '.join(slot_data) for keyword in ['单周']):
                set_cell_shading(cell, 'FCE4D6')
            elif any(keyword in ' '.join(slot_data) for keyword in ['双周']):
                set_cell_shading(cell, 'DDEBF7')

    # 为所有单元格添加边框
    for row in table.rows:
        for cell in row.cells:
            set_cell_border(cell)

    # 保存文档
    doc.save(output_path)
    print(f"Mock 课程表已生成: {output_path}")
    print(f"包含 {len(mock_data)} 个班级，{len(mock_data[0]['slots'])} 个时间段")
    return output_path


if __name__ == '__main__':
    create_mock_schedule()
