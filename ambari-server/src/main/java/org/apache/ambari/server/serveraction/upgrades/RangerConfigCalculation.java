/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.ambari.server.serveraction.upgrades;

import java.text.MessageFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;

import org.apache.ambari.server.AmbariException;
import org.apache.ambari.server.actionmanager.HostRoleStatus;
import org.apache.ambari.server.agent.CommandReport;
import org.apache.ambari.server.serveraction.AbstractServerAction;
import org.apache.ambari.server.state.Cluster;
import org.apache.ambari.server.state.Clusters;
import org.apache.ambari.server.state.Config;

import com.google.inject.Inject;

/**
 * Computes Ranger properties.  This class is only used when moving from
 * HDP-2.2 to HDP-2.3 in that upgrade pack.
 */
public class RangerConfigCalculation extends AbstractServerAction {
  private static final String SOURCE_CONFIG_TYPE = "admin-properties";

  @Inject
  private Clusters m_clusters;

  @Override
  public CommandReport execute(ConcurrentMap<String, Object> requestSharedDataContext)
      throws AmbariException, InterruptedException {

    String clusterName = getExecutionCommand().getClusterName();

    Cluster cluster = m_clusters.getCluster(clusterName);

    Config sourceConfig = cluster.getDesiredConfigByType(SOURCE_CONFIG_TYPE);

    if (null == sourceConfig) {
      return createCommandReport(0, HostRoleStatus.COMPLETED, "{}",
          MessageFormat.format("Source type {0} not found, skipping", SOURCE_CONFIG_TYPE), "");
    }

    String dbProp = "DB_FLAVOR";
    String dbHostProp = "db_host";
    String dbNameProp = "db_name";

    StringBuilder stdout = new StringBuilder();

    String db = sourceConfig.getProperties().get(dbProp);
    if (null == db) {
      return createCommandReport(0, HostRoleStatus.COMPLETED, "{}",
          MessageFormat.format("Target database from {0}/{1} not found, skipping",
              SOURCE_CONFIG_TYPE, dbProp), "");
    }

    stdout.append(MessageFormat.format("Database type is {0}\n", db));

    db = db.toLowerCase();
    if (!"mysql".equals(db) && !"oracle".equals(db)) {
      stdout.append(MessageFormat.format("Target database {0} is not recognized, skipping", db));
      return createCommandReport(0, HostRoleStatus.COMPLETED, "{}", stdout.toString(), "");
    }

    String dbHost = sourceConfig.getProperties().get(dbHostProp);
    String dbName = sourceConfig.getProperties().get(dbNameProp);

    stdout.append(MessageFormat.format("Database host: {0}\n", dbHost));
    stdout.append(MessageFormat.format("Database name: {0}\n", dbName));

    if (null == dbHost) {
      stdout.append(MessageFormat.format("Hostname must be set using {0}/{1} , skipping", SOURCE_CONFIG_TYPE, dbHostProp));

      return createCommandReport(0, HostRoleStatus.COMPLETED, "{}", stdout.toString(), "");
    }

    String driver = null;
    String url = null;
    String dialect = null;

    if ("mysql".equals(db)) {
      if (null == dbName) {
        stdout.append(MessageFormat.format("Target database {0} requires {1} to be set, skipping", db, dbName));

        return createCommandReport(0, HostRoleStatus.COMPLETED, "{}", stdout.toString(), "");
      }
      driver = "com.mysql.jdbc.Driver";
      url = MessageFormat.format("jdbc:mysql://{0}/{1}", dbHost, dbName);
      dialect = "org.eclipse.persistence.platform.database.MySQLPlatform";
    } else if ("oracle".equals(db)) {
      driver = "oracle.jdbc.OracleDriver";
      url = MessageFormat.format("jdbc:oracle:thin:@//{0}", dbHost);
      dialect = "org.eclipse.persistence.platform.database.OraclePlatform";
    }

    stdout.append(MessageFormat.format("Database driver: {0}\n", driver));
    stdout.append(MessageFormat.format("Database url: {0}\n", url));
    stdout.append(MessageFormat.format("Database dialect: {0}", dialect));

    Config config = cluster.getDesiredConfigByType("ranger-admin-site");
    Map<String, String> targetValues = config.getProperties();
    targetValues.put("ranger.jpa.jdbc.driver", driver);
    targetValues.put("ranger.jpa.jdbc.url", url);
    targetValues.put("ranger.jpa.jdbc.dialect", dialect);

    targetValues.put("ranger.jpa.audit.jdbc.driver", driver);
    targetValues.put("ranger.jpa.audit.jdbc.url", url);
    targetValues.put("ranger.jpa.audit.jdbc.dialect", dialect);

    config.setProperties(targetValues);
    config.persist(false);

    return createCommandReport(0, HostRoleStatus.COMPLETED, "{}", stdout.toString(), "");
  }


}
