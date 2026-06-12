#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从显式指定的通讯录文件清洗提取教师白名单。

清洗规则：
1. 去除名字中间的所有空格（如 "张   志" → "张志"）
2. 去除括号及其中内容（如 "张静（英语）" → "张静"）
3. 只保留 2-4 个纯汉字的名字（过滤掉 "北门卫"、"高教研究室" 等非人名）
4. 去重
5. 按字符串长度降序排列输出
"""

import argparse
import re
import sys
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    sys.exit("请安装 pandas: pip install pandas")

try:
    import openpyxl  # noqa: F401
except ImportError:
    sys.exit("请安装 openpyxl: pip install openpyxl")


def clean_name(raw: str) -> str:
    """清洗单个姓名：去空格、去括号备注。"""
    if pd.isna(raw):
        return ""
    name = str(raw).strip()
    # 去除名字中间的空格
    name = re.sub(r'\s+', '', name)
    # 去除括号及内容（中英文括号均处理）
    name = re.sub(r'[（(][^)）]*[)）]', '', name)
    # 去除其余空白
    name = name.strip()
    return name


def is_valid_name(name: str) -> bool:
    """只保留 2-4 个纯汉字的姓名。"""
    return bool(re.match(r'^[一-龥]{2,4}$', name))


def main():
    parser = argparse.ArgumentParser(description="从通讯录 XLSX 生成教师白名单")
    parser.add_argument("input_xlsx", help="输入 XLSX 文件路径")
    parser.add_argument("output_txt", help="输出白名单 TXT 文件路径")
    args = parser.parse_args()

    xlsx_path = Path(args.input_xlsx)
    output_path = Path(args.output_txt)

    if not xlsx_path.is_file():
        sys.exit("错误：输入 XLSX 文件不存在或不可读")

    df = pd.read_excel(xlsx_path)

    # 列结构：0=姓名, 1=职务, 2=职称, 3=办公电话, 4=手机
    # Row 0=标题, Row 1=表头, Row 2+=数据
    raw_data = df.iloc[2:, :]  # skip title + header rows

    cleaned = []
    skipped_buildings = []

    for idx, row in raw_data.iterrows():
        name = clean_name(row.iloc[0])
        if not is_valid_name(name):
            continue

        # 过滤非人员实体：职务、职称、手机 三列全为空 → 可能是楼宇/部门名
        # 列索引: 0=姓名, 1=职务, 2=职称, 3=办公电话, 4=手机
        title = row.iloc[1] if len(row) > 1 else None
        rank = row.iloc[2] if len(row) > 2 else None
        mobile = row.iloc[4] if len(row) > 4 else None

        has_title = pd.notna(title) and str(title).strip() != ""
        has_rank = pd.notna(rank) and str(rank).strip() != ""
        has_mobile = pd.notna(mobile) and str(mobile).strip() != ""

        if not has_title and not has_rank and not has_mobile:
            skipped_buildings.append(name)
            continue

        cleaned.append(name)

    # 去重
    unique = sorted(set(cleaned), key=lambda n: (-len(n), n))

    # 写入文件
    with open(output_path, "w", encoding="utf-8") as f:
        for name in unique:
            f.write(name + "\n")

    print(f"清洗前原始条目数: {len(raw_data)}")
    print(f"有效姓名（格式正确）: {len(cleaned)} (去重后 {len(unique)})")
    if skipped_buildings:
        print(f"已过滤非人员条目: {len(skipped_buildings)} 条")
    print(f"已保存到: {output_path}")

    return len(unique)


if __name__ == "__main__":
    main()
