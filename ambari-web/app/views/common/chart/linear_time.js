/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

var App = require('app');
var string_utils = require('utils/string_utils');

/**
 * @class
 * 
 * This is a view which GETs data from a URL and shows it as a time based line
 * graph. Time is shown on the X axis with data series shown on Y axis. It
 * optionally also has the ability to auto refresh itself over a given time
 * interval.
 * 
 * This is an abstract class which is meant to be extended.
 * 
 * Extending classes should override the following:
 * <ul>
 * <li>url - from where the data can be retrieved
 * <li>title - Title to be displayed when showing the chart
 * <li>id - which uniquely identifies this chart in any page
 * <li>#transformToSeries(jsonData) - function to map server data into graph
 * series
 * </ul>
 * 
 * Extending classes could optionally override the following:
 * <ul>
 * <li>#colorForSeries(series) - function to get custom colors per series
 * </ul>
 * 
 * @extends Ember.Object
 * @extends Ember.View
 */
App.ChartLinearTimeView = Ember.View.extend({
  templateName: require('templates/main/charts/linear_time'),

  /**
   * The URL from which data can be retrieved.
   *
   * This property must be provided for the graph to show properly.
   *
   * @type String
   * @default null
   */
  url: null,

  /**
   * A unique ID for this chart.
   *
   * @type String
   * @default null
   */
  id: null,

  /**
   * Title to be shown under the chart.
   *
   * @type String
   * @default null
   */
  title: null,

  /**
   * @private
   *
   * @type Rickshaw.Graph
   * @default null
   */
  _graph: null,

  /**
   * Array of classnames for each series (in widget)
   * @type Rickshaw.Graph
   */
  _popupGraph: null,

  /**
   * Array of classnames for each series
   * @type Array
   */
  _seriesProperties: null,

  /**
   * Array of classnames for each series (in widget)
   * @type Array
   */
  _seriesPropertiesWidget: null,

  /**
   * Renderer type
   * See <code>Rickshaw.Graph.Renderer</code> for more info
   * @type String
   */
  renderer: 'area',

  /**
   * Suffix used in DOM-elements selectors
   * @type String
   */
  popupSuffix: '-popup',

  /**
   * Is popup for current graph open
   * @type Boolean
   */
  isPopup: false,

  /**
   * Is graph ready
   * @type Boolean
   */
  isReady: false,

  /**
   * Is popup-graph ready
   * @type Boolean
   */
  isPopupReady: false,

  /**
   * Is data for graph available
   * @type Boolean
   */
  hasData: true,

  /**
   * chart height
   * @type {number}
   * @default 150
   */
  height: 150,

  /**
   * @type {string}
   * @default null
   */
  displayUnit: null,

  didInsertElement: function () {
    this.loadData();
    this.registerGraph();
    App.tooltip(this.$("[rel='ZoomInTooltip']"), {
      placement: 'left',
      template: '<div class="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner graph-tooltip"></div></div>'
    });
  },

  registerGraph: function() {
    var graph = {
      name: this.get('title'),
      id: this.get('elementId'),
      popupId: this.get('id')
    };
    App.router.get('updateController.graphs').push(graph);
  },

  loadData: function() {
    if (this.get('loadGroup')) {
      App.ChartLinearTimeView.LoadAggregator.add(this, this.get('loadGroup'));
    } else {
      App.ajax.send({
        name: this.get('ajaxIndex'),
        sender: this,
        data: this.getDataForAjaxRequest(),
        success: '_refreshGraph',
        error: 'loadDataErrorCallback'
      });
    }
  },

  getDataForAjaxRequest: function() {
    var toSeconds = Math.round(App.dateTime() / 1000);
    var hostName = (this.get('content')) ? this.get('content.hostName') : "";

    var HDFSService = App.HDFSService.find().objectAt(0);
    var nameNodeName = "";
    var YARNService = App.YARNService.find().objectAt(0);
    var resourceManager = YARNService ? YARNService.get('resourceManager.hostName') : "";
    var timeUnit = this.get('timeUnitSeconds');
    if (HDFSService) {
      nameNodeName = (HDFSService.get('activeNameNode')) ? HDFSService.get('activeNameNode.hostName') : HDFSService.get('nameNode.hostName');
    }
    return {
      toSeconds: toSeconds,
      fromSeconds: toSeconds - timeUnit,
      stepSeconds: 15,
      hostName: hostName,
      nameNodeName: nameNodeName,
      resourceManager: resourceManager
    };
  },

  loadDataErrorCallback: function(xhr, textStatus, errorThrown) {
    this.set('isReady', true);
    if (xhr.readyState == 4 && xhr.status) {
      textStatus = xhr.status + " " + textStatus;
    }
    this._showMessage('warn', this.t('graphs.error.title'), this.t('graphs.error.message').format(textStatus, errorThrown));
    this.set('isPopup', false);
    this.set('hasData', false);
  },

  /**
   * Shows a yellow warning message in place of the chart.
   *
   * @param type  Can be any of 'warn', 'error', 'info', 'success'
   * @param title Bolded title for the message
   * @param message String representing the message
   * @param tooltip Tooltip content
   * @type: Function
   */
  _showMessage: function(type, title, message, tooltip) {
    var chartOverlay = '#' + this.get('id');
    var chartOverlayId = chartOverlay + '-chart';
    var chartOverlayY = chartOverlay + '-yaxis';
    var chartOverlayX = chartOverlay + '-xaxis';
    var chartOverlayLegend = chartOverlay + '-legend';
    var chartOverlayTimeline = chartOverlay + '-timeline';
    var tooltipTitle = tooltip ? tooltip : Em.I18n.t('graphs.tooltip.title');
    var chartContent = '';
    if (this.get('isPopup')) {
      chartOverlayId += this.get('popupSuffix');
      chartOverlayY += this.get('popupSuffix');
      chartOverlayX += this.get('popupSuffix');
      chartOverlayLegend += this.get('popupSuffix');
      chartOverlayTimeline += this.get('popupSuffix');
    }
    var typeClass;
    switch (type) {
      case 'error':
        typeClass = 'alert-error';
        break;
      case 'success':
        typeClass = 'alert-success';
        break;
      case 'info':
        typeClass = 'alert-info';
        break;
      default:
        typeClass = '';
        break;
    }
    $(chartOverlayId+', '+chartOverlayY+', '+chartOverlayX+', '+chartOverlayLegend+', '+chartOverlayTimeline).html('');
    chartContent += '<div class=\"alert ' + typeClass + '\">';
    if (title) {
      chartContent += '<strong>' + title + '</strong> ';
    }
    chartContent += message + '</div>';
    $(chartOverlayId).append(chartContent);
    $(chartOverlayId).parent().attr('data-original-title', tooltipTitle);
  },

  /**
   * Transforms the JSON data retrieved from the server into the series
   * format that Rickshaw.Graph understands.
   *
   * The series object is generally in the following format: [ { name :
   * "Series 1", data : [ { x : 0, y : 0 }, { x : 1, y : 1 } ] } ]
   *
   * Extending classes should override this method.
   *
   * @param seriesData
   *          Data retrieved from the server
   * @param displayName
   *          Graph title
   * @type: Function
   *
   */
  transformData: function (seriesData, displayName) {
    var seriesArray = [];
    if (seriesData != null) {
      // Is it a string?
      if ("string" == typeof seriesData) {
        seriesData = JSON.parse(seriesData);
      }
      // Is it a number?
      if ("number" == typeof seriesData) {
        // Same number applies to all time.
        var number = seriesData;
        seriesData = [];
        seriesData.push([number, App.dateTime()-(60*60)]);
        seriesData.push([number, App.dateTime()]);
      }
      // We have valid data
      var series = {};
      series.name = displayName;
      series.data = [];
      for ( var index = 0; index < seriesData.length; index++) {
        series.data.push({
          x: seriesData[index][1],
          y: seriesData[index][0]
        });
      }
      return series;
    }
    return null;
  },

  /**
   * Provides the formatter to use in displaying Y axis.
   *
   * Uses the App.ChartLinearTimeView.DefaultFormatter which shows 10K,
   * 300M etc.
   *
   * @type Function
   */
  yAxisFormatter: function(y) {
    return App.ChartLinearTimeView.DefaultFormatter(y);
  },

  /**
   * Provides the color (in any HTML color format) to use for a particular
   * series.
   * May be redefined in child views
   *
   * @param series
   *          Series for which color is being requested
   * @return color String. Returning null allows this chart to pick a color
   *         from palette.
   * @default null
   * @type Function
   */
  colorForSeries: function (series) {
    return null;
  },

  /**
  * Check whether seriesData is correct data for chart drawing
  * @param {Array} seriesData
  * @return {Boolean}
  */
  checkSeries : function(seriesData) {
    if(!seriesData || !seriesData.length) {
      return false;
    }
    var result = true;
    seriesData.forEach(function(item) {
      if(!item.data || !item.data.length || !item.data[0] || typeof item.data[0].x === 'undefined') {
        result = false;
      }
    });
    return result;
  },

  /**
   * @private
   *
   * Refreshes the graph with the latest JSON data.
   *
   * @type Function
   */
  _refreshGraph: function (jsonData) {
    if(this.get('isDestroyed')){
      return;
    }
    var seriesData = this.transformToSeries(jsonData);

      //if graph opened as modal popup
      var popup_path = $("#" + this.get('id') + "-container" + this.get('popupSuffix'));
      var graph_container = $("#" + this.get('id') + "-container");
      if(popup_path.length) {
        popup_path.children().each(function () {
          $(this).children().remove();
        });
        this.set('isPopup', true);
      }
      else {
        graph_container.children().each(function (index, value) {
          $(value).children().remove();
        });
      }
    if (this.checkSeries(seriesData)) {
      // Check container exists (may be not, if we go to another page and wait while graphs loading)
      if (graph_container.length) {
        var container = $("#" + this.get('id') + "-container");
        this.draw(seriesData);
        this.set('hasData', true);
          //move yAxis value lower to make them fully visible
        container.find('.y_axis text').attr('y', 8);
        container.attr('data-original-title', Em.I18n.t('graphs.tooltip.title'));
      }
    }
    else {
      this.set('isReady', true);
      //if Axis X time interval is default(60 minutes)
      if(this.get('timeUnitSeconds') === 3600){
        this._showMessage('info', null, this.t('graphs.noData.message'), this.t('graphs.noData.tooltip.title'));
        this.set('hasData', false);
      }
      else {
        this._showMessage('info', this.t('graphs.noData.title'), this.t('graphs.noDataAtTime.message'));
      }
      this.set('isPopup', false);
    }
  },

  /**
   * Returns a custom time unit, that depends on X axis interval length, for the graph's X axis.
   * This is needed as Rickshaw's default time X axis uses UTC time, which can be confusing
   * for users expecting locale specific time.
   *
   * If <code>null</code> is returned, Rickshaw's default time unit is used.
   *
   * @type Function
   * @return Rickshaw.Fixtures.Time
   */
  localeTimeUnit: function(timeUnitSeconds) {
    var timeUnit = new Rickshaw.Fixtures.Time();
    switch (timeUnitSeconds){
      case 604800:
        timeUnit = timeUnit.unit('day');
        break;
      case 2592000:
        timeUnit = timeUnit.unit('week');
        break;
      case 31104000:
        timeUnit = timeUnit.unit('month');
        break;
      default:
        timeUnit = {
          name: timeUnitSeconds / 240 + ' minute',
          seconds: timeUnitSeconds / 4,
          formatter: function (d) {
            // format locale specific time
            var minutes = d.getMinutes() > 9 ? "" + d.getMinutes() : "0" + d.getMinutes();
            var hours = d.getHours() > 9 ? "" + d.getHours() : "0" + d.getHours();
            return hours + ":" + minutes;
          }
        };
    }
    return timeUnit;
  },

  /**
   * temporary fix for incoming data for graph
   * to shift data time to correct time point
   * @param {Array} data
   */
  dataShiftFix: function(data) {
    var nowTime = Math.round(App.dateTime() / 1000);
    data.forEach(function(series){
      var l = series.data.length;
      var shiftDiff = nowTime - series.data[l - 1].x;
      if(shiftDiff > 3600){
        for(var i = 0;i < l;i++){
          series.data[i].x = series.data[i].x + shiftDiff;
        }
        series.data.unshift({
          x: nowTime - this.get('timeUnitSeconds'),
          y: 0
        });
      }
    }, this);
  },

  /**
   * calculate statistic data for popup legend and set proper colors for series
   * @param {Array} data
   */
  dataPreProcess: function(data) {
    var self = this;
    var palette = new Rickshaw.Color.Palette({ scheme: 'munin'});
    // Format series for display
    var series_min_length = 100000000;
    data.forEach(function (series) {
      var displayUnit = self.get('displayUnit');
      var seriesColor = self.colorForSeries(series);
      if (Em.isNone(seriesColor)) {
        seriesColor = palette.color();
      }
      series.color = seriesColor;
      series.stroke = 'rgba(0,0,0,0.3)';
      if (self.get('isPopup')) {
        // calculate statistic data for popup legend
        var avg = 0;
        var min = Number.MAX_VALUE;
        var max = Number.MIN_VALUE;
        for (var i = 0; i < series.data.length; i++) {
          avg += series.data[i]['y'];
          if (!Em.isNone(series.data[i]['y'])) {
            if (series.data[i]['y'] < min) {
              min = series.data[i]['y'];
            }
          }
          if (series.data[i]['y'] > max) {
            max = series.data[i]['y'];
          }
        }


        series.name = string_utils.pad(series.name.length > 36 ? series.name.substr(0, 36) + '...' : series.name, 40, '&nbsp;', 2) + '|&nbsp;' +
        string_utils.pad('min', 5, '&nbsp;', 3) +
        string_utils.pad(self.get('yAxisFormatter')(min), 12, '&nbsp;', 3) +
        string_utils.pad('avg', 5, '&nbsp;', 3) +
        string_utils.pad(self.get('yAxisFormatter')(avg / series.data.compact().length), 12, '&nbsp;', 3) +
        string_utils.pad('max', 12, '&nbsp;', 3) +
        string_utils.pad(self.get('yAxisFormatter')(max), 5, '&nbsp;', 3);
      }
      if (series.data.length < series_min_length) {
        series_min_length = series.data.length;
      }
    });

    // All series should have equal length
    data.forEach(function(series) {
      if (series.data.length > series_min_length) {
        series.data.length = series_min_length;
      }
    });
  },

  draw: function(seriesData) {
    var self = this;
    var isPopup = this.get('isPopup');
    var p = isPopup ? this.get('popupSuffix') : '';

    this.dataShiftFix(seriesData);
    this.dataPreProcess(seriesData);

    var chartId = "#" + this.get('id') + "-chart" + p;
    var chartOverlayId = "#" + this.get('id') + "-container" + p;
    var xaxisElementId = "#" + this.get('id') + "-xaxis" + p;
    var yaxisElementId = "#" + this.get('id') + "-yaxis" + p;
    var legendElementId = "#" + this.get('id') + "-legend" + p;

    var chartElement = document.querySelector(chartId);
    var overlayElement = document.querySelector(chartOverlayId);
    var xaxisElement = document.querySelector(xaxisElementId);
    var yaxisElement = document.querySelector(yaxisElementId);
    var legendElement = document.querySelector(legendElementId);

    var height = this.get('height');
    var width = 400;
    var diff = 32;

    if(this.get('inWidget')) {
      height = 105; // for widgets view
      diff = 22;
    }
    if (isPopup) {
      height = 180;
      width = 670;
    }
    else {
      // If not in popup, the width could vary.
      // We determine width based on div's size.
      var thisElement = this.get('element');
      if (thisElement!=null) {
        var calculatedWidth = $(thisElement).width();
        if (calculatedWidth > diff) {
          width = calculatedWidth - diff;
        }
      }
    }

    var _graph = new Rickshaw.GraphReopened({
      height: height,
      width: width,
      element: chartElement,
      series: seriesData,
      interpolation: 'step-after',
      stroke: true,
      renderer: this.get('renderer'),
      strokeWidth: (this.get('renderer') != 'area' ? 2 : 1)
    });

    if (this.get('renderer') === 'area') {
      _graph.renderer.unstack = false;
    }

    new Rickshaw.Graph.Axis.Time({
      graph: _graph,
      timeUnit: this.localeTimeUnit(this.get('timeUnitSeconds'))
    });

    new Rickshaw.Graph.Axis.Y({
      tickFormat: this.yAxisFormatter,
      pixelsPerTick: (isPopup ? 75 : 40),
      element: yaxisElement,
      orientation: (isPopup ? 'left' : 'right'),
      graph: _graph
    });

    var legend = new Rickshaw.Graph.Legend({
      graph: _graph,
      element: legendElement,
      description: self.get('description')
    });

    new Rickshaw.Graph.Behavior.Series.Toggle({
      graph: _graph,
      legend: legend
    });

    new Rickshaw.Graph.Behavior.Series.Order({
      graph: _graph,
      legend: legend
    });

    if (!isPopup) {
      overlayElement.addEventListener('mousemove', function () {
        $(xaxisElement).removeClass('hide');
        $(legendElement).removeClass('hide');
        $(chartElement).children("div").removeClass('hide');
      });
      overlayElement.addEventListener('mouseout', function () {
        $(legendElement).addClass('hide');
      });
      _graph.onUpdate(function () {
        $(legendElement).addClass('hide');
      });
    }

    //show the graph when it's loaded
    _graph.onUpdate(function() {
      self.set('isReady', true);
    });
    _graph.render();

    if (isPopup) {
      new Rickshaw.Graph.HoverDetail({
        graph: _graph,
        yFormatter:function (y) {
          return self.yAxisFormatter(y);
        },
        xFormatter:function (x) {
          return (new Date(x * 1000)).toLocaleTimeString();
        },
        formatter:function (series, x, y, formattedX, formattedY, d) {
          return formattedY + '<br />' + formattedX;
        }
      });
    }

    _graph = this.updateSeriesInGraph(_graph);
    if (isPopup) {
      //show the graph when it's loaded
      _graph.onUpdate(function() {
        self.set('isPopupReady', true);
      });
      _graph.update();

      var selector = '#'+this.get('id')+'-container'+this.get('popupSuffix');
      $(selector + ' li.line').click(function() {
        var series = [];
        $(selector + ' a.action').each(function(index, v) {
          series[index] = v.parentNode.classList;
        });
        self.set('_seriesProperties', series);
      });

      this.set('_popupGraph', _graph);
    }
    else {
      _graph.update();
      var selector = '#'+this.get('id')+'-container';
      $(selector + ' li.line').click(function() {
        var series = [];
        $(selector + ' a.action').each(function(index, v) {
          series[index] = v.parentNode.classList;
        });
        self.set('_seriesPropertiesWidget', series);
      });

      this.set('_graph', _graph);
    }
  },

  /**
   *
   * @param {Rickshaw.Graph} graph
   * @returns {Rickshaw.Graph}
   */
  updateSeriesInGraph: function(graph) {
    var id = this.get('id');
    var isPopup = this.get('isPopup');
    var popupSuffix = this.get('popupSuffix');
    var _series = isPopup ? this.get('_seriesProperties') : this.get('_seriesPropertiesWidget');
    graph.series.forEach(function(series, index) {
      if (_series !== null && _series[index] !== null && _series[index] !== undefined ) {
        if(_series[_series.length - index - 1].length > 1) {
          var s = '#' + id + '-container' + (isPopup ? popupSuffix : '') + ' a.action:eq(' + (_series.length - index - 1) + ')';
          $(s).parent('li').addClass('disabled');
          series.disable();
        }
      }
    });
    return graph;
  },

  showGraphInPopup: function() {
    if(!this.get('hasData') || this.get('isPreview')) {
      return;
    }

    this.set('isPopup', true);
    var self = this;

    App.ModalPopup.show({
      bodyClass: Em.View.extend({

        containerId: null,
        containerClass: null,
        yAxisId: null,
        yAxisClass: null,
        xAxisId: null,
        xAxisClass: null,
        legendId: null,
        legendClass: null,
        chartId: null,
        chartClass: null,
        titleId: null,
        titleClass: null,

        isReady: function() {
          return this.get('parentView.graph.isPopupReady');
        }.property('parentView.graph.isPopupReady'),

        didInsertElement: function() {
          $('#modal').addClass('modal-graph-line');
          var popupSuffix = this.get('parentView.graph.popupSuffix');
          var id = this.get('parentView.graph.id');
          var idTemplate = id + '-{element}' + popupSuffix;

          this.set('containerId', idTemplate.replace('{element}', 'container'));
          this.set('containerClass', 'chart-container' + popupSuffix);
          this.set('yAxisId', idTemplate.replace('{element}', 'yaxis'));
          this.set('yAxisClass', this.get('yAxisId').replace(popupSuffix, ''));
          this.set('xAxisId', idTemplate.replace('{element}', 'xaxis'));
          this.set('xAxisClass', this.get('xAxisId').replace(popupSuffix, ''));
          this.set('legendId', idTemplate.replace('{element}', 'legend'));
          this.set('legendClass', this.get('legendId').replace(popupSuffix, ''));
          this.set('chartId', idTemplate.replace('{element}', 'chart'));
          this.set('chartClass', this.get('chartId').replace(popupSuffix, ''));
          this.set('titleId', idTemplate.replace('{element}', 'title'));
          this.set('titleClass', this.get('titleId').replace(popupSuffix, ''));
        },

        templateName: require('templates/common/chart/linear_time'),
        /**
         * check is time paging feature is enable for graph
         */
        isTimePagingEnable: function() {
          return !self.get('isTimePagingDisable');
        }.property(),
        rightArrowVisible: function() {
          return (this.get('isReady') && (this.get('parentView.currentTimeIndex') != 0));
        }.property('isReady', 'parentView.currentTimeIndex'),
        leftArrowVisible: function() {
          return (this.get('isReady') && (this.get('parentView.currentTimeIndex') != 7));
        }.property('isReady', 'parentView.currentTimeIndex')
      }),
      header: this.get('title'),
      /**
       * App.ChartLinearTimeView
       */
      graph: self,
      secondary: null,
      onPrimary: function() {
        this.hide();
        self.set('isPopup', false);
      },
      onClose: function() {
        this.onPrimary();
      },
      /**
       * move graph back by time
       * @param event
       */
      switchTimeBack: function(event) {
        var index = this.get('currentTimeIndex');
        // 7 - number of last time state
        if(index < 7) {
          this.reloadGraphByTime(++index);
        }
      },
      /**
       * move graph forward by time
       * @param event
       */
      switchTimeForward: function(event) {
        var index = this.get('currentTimeIndex');
        if(index > 0) {
          this.reloadGraphByTime(--index);
        }
      },
      /**
       * reload graph depending on the time
       * @param index
       */
      reloadGraphByTime: function(index) {
        this.set('currentTimeIndex', index);
        self.set('currentTimeIndex', index);
        self.loadData();
      },
      currentTimeIndex: self.get('currentTimeIndex'),
      currentTimeState: function() {
        return self.get('timeStates').objectAt(this.get('currentTimeIndex'));
      }.property('currentTimeIndex')
    });
    Ember.run.next(function() {
      self.loadData();
      self.set('isPopupReady', false);
    });
  },
  timeStates: [
    {name: Em.I18n.t('graphs.timeRange.hour'), seconds: 3600},
    {name: Em.I18n.t('graphs.timeRange.twoHours'), seconds: 7200},
    {name: Em.I18n.t('graphs.timeRange.fourHours'), seconds: 14400},
    {name: Em.I18n.t('graphs.timeRange.twelveHours'), seconds: 43200},
    {name: Em.I18n.t('graphs.timeRange.day'), seconds: 86400},
    {name: Em.I18n.t('graphs.timeRange.week'), seconds: 604800},
    {name: Em.I18n.t('graphs.timeRange.month'), seconds: 2592000},
    {name: Em.I18n.t('graphs.timeRange.year'), seconds: 31104000}
  ],
  // should be set by time range control dropdown list when create current graph
  currentTimeIndex: 0,
  timeUnitSeconds: function() {
    return this.get('timeStates').objectAt(this.get('currentTimeIndex')).seconds;
  }.property('currentTimeIndex')
});

/**
 * A formatter which will turn a number into computer storage sizes of the
 * format '23 GB' etc.
 * 
 * @type {Function}
 */
App.ChartLinearTimeView.BytesFormatter = function (y) {
  if (y == 0) return '0 B';
  var value = Rickshaw.Fixtures.Number.formatBase1024KMGTP(y);
  if (!y || y.length < 1) {
    value = '0 B';
  }
  else {
    if ("number" == typeof value) {
      value = String(value);
    }
    if ("string" == typeof value) {
      value = value.replace(/\.\d(\d+)/, function($0, $1){ // Remove only 1-digit after decimal part
        return $0.replace($1, '');
      }); 
      // Either it ends with digit or ends with character
      value = value.replace(/(\d$)/, '$1 '); // Ends with digit like '120'
      value = value.replace(/([a-zA-Z]$)/, ' $1'); // Ends with character like
      // '120M'
      value = value + 'B'; // Append B to make B, MB, GB etc.
    }
  }
  return value;
};

/**
 * A formatter which will turn a number into percentage display like '42%'
 * 
 * @type {Function}
 */
App.ChartLinearTimeView.PercentageFormatter = function (percentage) {
  var value = percentage;
  if (!value || value.length < 1) {
    value = '0 %';
  } else {
    value = value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%';
  }
  return value;
};

/**
 * A formatter which will turn a number into percentage display like '42%'
 *
 * @type {Function}
 */
App.ChartLinearTimeView.DisplayUnitFormatter = function (value, displayUnit) {
  if (!value || value.length === 0) {
    value = '0 ' + displayUnit;
  } else {
    value = value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + " " + displayUnit;
  }
  return value;
};

/**
 * A formatter which will turn elapsed time into display time like '50 ms',
 * '5s', '10 m', '3 hr' etc. Time is expected to be provided in milliseconds.
 * 
 * @type {Function}
 */
App.ChartLinearTimeView.TimeElapsedFormatter = function (millis) {
  var value = millis;
  if (!value || value.length < 1) {
    value = '0 ms';
  } else if ("number" == typeof millis) {
    var seconds = millis > 1000 ? Math.round(millis / 1000) : 0;
    var minutes = seconds > 60 ? Math.round(seconds / 60) : 0;
    var hours = minutes > 60 ? Math.round(minutes / 60) : 0;
    var days = hours > 24 ? Math.round(hours / 24) : 0;
    if (days > 0) {
      value = days + ' d';
    } else if (hours > 0) {
      value = hours + ' hr';
    } else if (minutes > 0) {
      value = minutes + ' m';
    } else if (seconds > 0) {
      value = seconds + ' s';
    } else if (millis > 0) {
      value = millis.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' ms';
    } else {
      value = millis.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' ms';
    }
  }
  return value;
};

/**
 * The default formatter which uses Rickshaw.Fixtures.Number.formatKMBT 
 * which shows 10K, 300M etc.
 *
 * @type {Function}
 */
App.ChartLinearTimeView.DefaultFormatter = function(y) {
  if(isNaN(y)){
    return 0;
  }
  var value = Rickshaw.Fixtures.Number.formatKMBT(y);
  if (value == '') return '0';
  value = String(value);
  var c = value[value.length - 1];
  if (!isNaN(parseInt(c))) {
    // c is digit
    value = parseFloat(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }
  else {
    // c in not digit
    value = parseFloat(value.substr(0, value.length - 1)).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + c;
  }
  return value;
};


/**
 * Creates and returns a formatter that can convert a 'value' 
 * to 'value units/s'. 
 * 
 * @param unitsPrefix Prefix which will be used in 'unitsPrefix/s'
 * @param valueFormatter  Value itself will need further processing 
 *        via provided formatter. Ex: '10M requests/s'. Generally
 *        should be App.ChartLinearTimeView.DefaultFormatter. 
 * @return {Function}
 */
App.ChartLinearTimeView.CreateRateFormatter = function (unitsPrefix, valueFormatter) {
  var suffix = " "+unitsPrefix+"/s";
  return function (value) {
    value = valueFormatter(value) + suffix;
    return value;
  };
};

Rickshaw.GraphReopened = function(a){
  Rickshaw.Graph.call(this, a);
};

//reopened in order to exclude "null" value from validation
Rickshaw.GraphReopened.prototype = Object.create(Rickshaw.Graph.prototype, {
  validateSeries : {
    value: function(series) {

      if (!(series instanceof Array) && !(series instanceof Rickshaw.Series)) {
        var seriesSignature = Object.prototype.toString.apply(series);
        throw "series is not an array: " + seriesSignature;
      }

      var pointsCount;

      series.forEach( function(s) {

        if (!(s instanceof Object)) {
          throw "series element is not an object: " + s;
        }
        if (!(s.data)) {
          throw "series has no data: " + JSON.stringify(s);
        }
        if (!(s.data instanceof Array)) {
          throw "series data is not an array: " + JSON.stringify(s.data);
        }

        pointsCount = pointsCount || s.data.length;

        if (pointsCount && s.data.length != pointsCount) {
          throw "series cannot have differing numbers of points: " +
          pointsCount	+ " vs " + s.data.length + "; see Rickshaw.Series.zeroFill()";
        }
      })
    },
    enumerable: true,
    configurable: false,
    writable: false
  }
});

//show no line if point is "null"
Rickshaw.Graph.Renderer.Line.prototype.seriesPathFactory = function() {

  var graph = this.graph;

  return d3.svg.line()
    .x( function(d) { return graph.x(d.x) } )
    .y( function(d) { return graph.y(d.y) } )
    .defined(function(d) { return d.y!=null; })
    .interpolate(this.graph.interpolation).tension(this.tension);
};

//show no area if point is null
Rickshaw.Graph.Renderer.Stack.prototype.seriesPathFactory = function() {

  var graph = this.graph;

  return d3.svg.area()
    .x( function(d) { return graph.x(d.x) } )
    .y0( function(d) { return graph.y(d.y0) } )
    .y1( function(d) { return graph.y(d.y + d.y0) } )
    .defined(function(d) { return d.y!=null; })
    .interpolate(this.graph.interpolation).tension(this.tension);
};


/**
 * aggregate requests to load metrics by component name
 * requests can be added via add method
 * input example:
 * {
 *   data: request,
 *   context: this,
 *   startCallName: this.getServiceComponentMetrics,
 *   successCallback: this.getMetricsSuccessCallback,
 *   completeCallback: function () {
 *     requestCounter--;
 *     if (requestCounter === 0) this.onMetricsLoaded();
 *   }
 * }
 * @type {Em.Object}
 */
App.ChartLinearTimeView.LoadAggregator = Em.Object.create({
  /**
   * @type {Array}
   */
  requests: [],

  /**
   * @type {number|null}
   */
  timeoutId: null,

  /**
   * time interval within which calls get collected
   * @type {number}
   * @const
   */
  BULK_INTERVAL: 1000,

  /**
   * add request
   * every {{BULK_INTERVAL}} requests get collected, aggregated and sent to server
   *
   * @param {object} context
   * @param {object} requestData
   */
  add: function (context, requestData) {
    var self = this;

    requestData.context = context;
    this.get('requests').push(requestData);
    if (Em.isNone(this.get('timeoutId'))) {
      this.set('timeoutId', window.setTimeout(function () {
        self.runRequests(self.get('requests'));
        self.get('requests').clear();
        clearTimeout(self.get('timeoutId'));
        self.set('timeoutId', null);
      }, this.get('BULK_INTERVAL')));
    }
  },

  /**
   * return requests which grouped into bulks
   * @param {Array} requests
   * @returns {object} bulks
   */
  groupRequests: function (requests) {
    var bulks = {};

    requests.forEach(function (request) {
      var id = request.name;

      if (Em.isNone(bulks[id])) {
        bulks[id] = {
          name: request.name,
          fields: request.fields,
          context: request.context
        };
        bulks[id].subRequests = [{
          context: request.context
        }];
      } else {
        bulks[id].fields.pushObjects(request.fields);
        bulks[id].subRequests.push({
          context: request.context
        });
      }
    }, this);
    return bulks;
  },

  /**
   * run aggregated requests
   * @param {Array} requests
   */
  runRequests: function (requests) {
    var bulks = this.groupRequests(requests);
    var self = this;

    for (var id in bulks) {
      (function (_request) {
        var fields = self.formatRequestData(_request);
        var hostName = (_request.context.get('content')) ? _request.context.get('content.hostName') : "";

        App.ajax.send({
          name: _request.name,
          sender: _request.context,
          data: {
            fields: fields,
            hostName: hostName
          }
        }).done(function (response) {
          _request.subRequests.forEach(function (subRequest) {
            subRequest.context._refreshGraph.call(subRequest.context, response);
          }, this);
        }).fail(function (jqXHR, textStatus, errorThrown) {
          _request.subRequests.forEach(function (subRequest) {
            subRequest.context.loadDataErrorCallback.call(subRequest.context, jqXHR, textStatus, errorThrown );
          }, this);
        });
      })(bulks[id]);
    }
  },

  /**
   *
   * @param {object} request
   * @returns {number[]}
   */
  formatRequestData: function (request) {
    var toSeconds = Math.round(App.dateTime() / 1000);
    var timeUnit = request.context.get('timeUnitSeconds');
    var fields = request.fields.uniq().map(function (field) {
      return field + "[" + (toSeconds - timeUnit) + "," + toSeconds + "," + 15 + "]";
    });

    return fields.join(",");
  }
});