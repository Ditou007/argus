FROM python:3.12-slim
WORKDIR /app
COPY sample-agent/argus_sdk.py .
COPY sample-agent/agent.py .
COPY sample-agent/agent_v2.py .
CMD ["python", "-u", "agent_v2.py"]
