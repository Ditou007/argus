FROM python:3.12-slim
WORKDIR /app

# curl is used by the long-running agent's (benign, undeclared) child-exfil chain,
# which exercises the agent -> sh -> curl process-tree capture.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Seed dummy credential files so the agent's UNDECLARED read of them produces a
# realistic HIGH-sensitivity "claim gap" event. Contents are fake.
RUN mkdir -p /root/.ssh /root/.aws \
    && echo "-----BEGIN OPENSSH PRIVATE KEY-----\nDUMMY-NOT-A-REAL-KEY\n-----END OPENSSH PRIVATE KEY-----" > /root/.ssh/id_rsa \
    && echo "[default]\naws_access_key_id=AKIADUMMY\naws_secret_access_key=dummysecret" > /root/.aws/credentials \
    && chmod 600 /root/.ssh/id_rsa /root/.aws/credentials

COPY sample-agent/argus_sdk.py .
COPY sample-agent/llm_providers.py .
COPY sample-agent/agent.py .
COPY sample-agent/agent_v2.py .
COPY sample-agent/real_agent.py .
COPY sample-agent/long_running_agent.py .
CMD ["python", "-u", "agent_v2.py"]
