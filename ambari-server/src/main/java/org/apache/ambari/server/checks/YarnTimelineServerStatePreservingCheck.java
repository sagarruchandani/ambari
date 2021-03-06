/*
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
package org.apache.ambari.server.checks;

import java.util.Map;

import org.apache.ambari.server.AmbariException;
import org.apache.ambari.server.controller.PrereqCheckRequest;
import org.apache.ambari.server.state.Cluster;
import org.apache.ambari.server.state.Service;
import org.apache.ambari.server.state.stack.PrereqCheckStatus;
import org.apache.ambari.server.state.stack.PrerequisiteCheck;
import org.apache.ambari.server.utils.VersionUtils;
import org.apache.commons.lang.BooleanUtils;

import com.google.inject.Singleton;

/**
 * The {@link YarnTimelineServerStatePreservingCheck} is used to check that the
 * YARN Timeline server has state preserving mode enabled. This value is only
 * present in HDP 2.2.4.2+.
 */
@Singleton
@UpgradeCheck(group = UpgradeCheckGroup.DEFAULT, order = 1.0f)
public class YarnTimelineServerStatePreservingCheck extends AbstractCheckDescriptor {

  private final static String YARN_TIMELINE_STATE_RECOVERY_ENABLED_KEY = "yarn.timeline-service.recovery.enabled";

  /**
   * Constructor.
   */
  public YarnTimelineServerStatePreservingCheck() {
    super(CheckDescription.SERVICES_YARN_TIMELINE_ST);
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public boolean isApplicable(PrereqCheckRequest request) throws AmbariException {
    if (!super.isApplicable(request)) {
      return false;
    }

    final Cluster cluster = clustersProvider.get().getCluster(request.getClusterName());
    Map<String, Service> services = cluster.getServices();
    if (!services.containsKey("YARN")) {
      return false;
    }

    // not applicable if not HDP 2.2.4.2 or later
    String stackName = cluster.getCurrentStackVersion().getStackName();
    if (!"HDP".equals(stackName)) {
      return false;
    }

    String currentClusterRepositoryVersion = cluster.getCurrentClusterVersion().getRepositoryVersion().getVersion();
    if (VersionUtils.compareVersions(currentClusterRepositoryVersion, "2.2.4.2") < 0) {
      return false;
    }

    return true;
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public void perform(PrerequisiteCheck prerequisiteCheck, PrereqCheckRequest request) throws AmbariException {
    String propertyValue = getProperty(request, "yarn-site",
        YARN_TIMELINE_STATE_RECOVERY_ENABLED_KEY);

    if (null == propertyValue || !BooleanUtils.toBoolean(propertyValue)) {
      prerequisiteCheck.getFailedOn().add("YARN");
      prerequisiteCheck.setStatus(PrereqCheckStatus.FAIL);
      prerequisiteCheck.setFailReason(getFailReason(prerequisiteCheck, request));
    }
  }
}
