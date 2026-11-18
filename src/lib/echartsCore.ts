import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * 模块化引入：只注册需要的柱状图 / 散点图 / 折线图、直角坐标系与提示框、Canvas 渲染器，
 * 不引入额外的 React 图表封装库，产物里不打包用不到的图表类型（图例、数据集、坐标轴指示器均未注册）。
 */
echarts.use([BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, CanvasRenderer]);

export { echarts };
export type EChartsInstance = echarts.ECharts;
